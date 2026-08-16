/**
 * Host half of the dsh-cost-overlay plugin: registers the plugin settings
 * section (price table overrides, master switch), registers the deepseekCost
 * session projection (per-model cumulative usage and cost), and serves the
 * loopback-only recompute route the detail panel's "recompute" button calls.
 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-session-projection'
import { createCostProjectionDefinition, type CostProjectionDeps } from './projection.ts'
import {
  DEFAULT_PEAK_WINDOWS,
  DEFAULT_PRICE_TABLE,
  DEFAULT_REGIME_SWITCH_AT,
  PRICE_CELLS,
  PRICE_PERIODS,
} from './core/pricing.ts'
import type { PriceTable } from './core/pricing.ts'
import { COST_NS, priceField, priceFields, type CostOverlayConfig } from './core/types.ts'
import { RECOMPUTE_PATH, type RecomputeResponse } from './core/protocol.ts'

/** Services required by the host projection plugin (webServer for the recompute route). */
export const inject = ['sessionProjections', 'webServer']

/** Settings namespace of the plugin (spelled identically on the browser half). */
export const COST_SETTINGS_NAMESPACE = settingsNamespace(COST_NS)

/** Dotted price-override schema fields (2 models x 3 periods x 3 cells). */
const priceOverrideSchema = Object.fromEntries(
  priceFields().map(field => [field, z.number().min(0)]),
)

/** Plugin configuration: master switch, regime knobs, and per-cell price overrides. */
export interface Config extends CostOverlayConfig {
  enabled?: boolean
  switchAt?: number
  peakWindows?: number[][]
}

/** Runtime schema for {@link Config}. Object fields are optional by default in schemastery. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  switchAt: z.number().step(1).min(0),
  peakWindows: z.array(z.array(z.number())),
  ...priceOverrideSchema,
})

/** Merge user overrides over the official default table. */
export function resolveTable(config: CostOverlayConfig): PriceTable {
  const table = JSON.parse(JSON.stringify(DEFAULT_PRICE_TABLE)) as PriceTable
  for (const model of Object.keys(table)) {
    const entry = table[model]
    if (entry === undefined) continue
    for (const period of PRICE_PERIODS) {
      for (const cell of PRICE_CELLS) {
        const value = config[priceField(model, period, cell)]
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          entry[period][cell] = value
        }
      }
    }
  }
  return table
}

/** Resolve the regime switch epoch (official default when unset). */
export function resolveSwitchAt(config: CostOverlayConfig): number {
  return typeof config.switchAt === 'number' && Number.isFinite(config.switchAt) && config.switchAt >= 0
    ? config.switchAt
    : DEFAULT_REGIME_SWITCH_AT
}

/** Resolve the peak windows (official default when unset or malformed). */
export function resolveWindows(config: CostOverlayConfig): ReadonlyArray<readonly [number, number]> {
  const raw = config.peakWindows
  if (Array.isArray(raw) && raw.length > 0 && raw.every(
    pair => Array.isArray(pair) && pair.length === 2 && pair.every(h => Number.isFinite(h)),
  )) {
    return raw.map(pair => {
      const start = pair[0] ?? 0
      const end = pair[1] ?? 24
      return [Math.max(0, Math.min(23, start)), Math.max(1, Math.min(24, end))] as const
    })
  }
  return DEFAULT_PEAK_WINDOWS
}

/** Build the projection deps from one config source. */
function depsOf(source: CostOverlayConfig): CostProjectionDeps {
  return {
    table: resolveTable(source),
    switchAt: resolveSwitchAt(source),
    windows: resolveWindows(source),
  }
}

/** Loopback-only fence (browser same-origin markers; mirrors the pairing routes). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

/**
 * Register the deepseekCost projection and the plugin settings section.
 * @param ctx - host plugin context carrying sessionProjections.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config: Config = {}): void {
  // The authoritative price source: the settings scope once the web settings
  // surface serves the namespace, the composition entry otherwise.
  let current: () => Config = () => config
  let disposeProjection: (() => void) | undefined
  let registeredCount = 0

  const rebuild = (): void => {
    if (disposeProjection !== undefined) {
      disposeProjection()
      disposeProjection = undefined
    }
    registeredCount = 0
    if ((current().enabled ?? true) === false) return
    const disposer = ctx.sessionProjections.register(createCostProjectionDefinition(depsOf(current()), current()))
    disposeProjection = disposer
    registeredCount = 1
  }

  installSettingsSection(ctx, COST_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => { current = source },
    onChange: rebuild,
  })

  const disposers: Array<() => void> = []
  const route: WebRoute = {
    kind: 'exact',
    path: RECOMPUTE_PATH,
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' })
        return
      }
      if ((req.method ?? 'GET') !== 'POST') {
        writeJson(res, 405, { error: `method not allowed: ${req.method}` })
        return
      }
      rebuild()
      const body: RecomputeResponse = { ok: true, registered: registeredCount }
      writeJson(res, 200, body)
    },
  }
  disposers.push(ctx.webServer.register(route))
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-cost-overlay: host route')
  rebuild()
}

export { createCostProjectionDefinition } from './projection.ts'
export { DEFAULT_PRICE_TABLE, DEFAULT_REGIME_SWITCH_AT, DEFAULT_PEAK_WINDOWS } from './core/pricing.ts'
export type { PriceCells, PriceTable } from './core/pricing.ts'
export type { DeepseekCostProjection, CostOverlayConfig } from './core/types.ts'
