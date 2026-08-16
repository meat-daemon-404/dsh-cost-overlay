/**
 * The deepseekCost session projection: folds committed session events into
 * per-model cumulative token buckets and cost, attributed at the exact time
 * each step's usage settles (so peak/valley pricing is applied per event and
 * the fold stays replayable — event `time` is part of the durable log).
 *
 * Pure transition functions only; the framework drives `apply` on every
 * committed event and pushes the schema-validated `view` value to clients.
 */

import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import { cellsFor, costOf, hitRateOf } from './core/pricing.ts'
import type { PriceTable } from './core/pricing.ts'
import type { CostOverlayConfig, DeepseekCostProjection } from './core/types.ts'

/** One model's session-cumulative accounting. */
export interface ModelAccum {
  uncached: number
  read: number
  out: number
  cost: number
}

/** Projection fold state — plain JSON per the unit contract. */
export interface CostState {
  /** The model/provider in force from the latest request/header. */
  current: {
    provider: string | null
    model: string | null
  }
  /** Per-model cumulative accounting, keyed by model id. */
  byModel: Record<string, ModelAccum>
  /** The (turn, step) already settled — usage settles exactly once per step. */
  settledStep: { turn: number; step: number } | null
}

/** Immutable projection dependencies (fixed per registration). */
export interface CostProjectionDeps {
  /** Resolved price table (defaults plus user overrides). */
  table: PriceTable
  /** Epoch ms of the flat -> peak/valley regime switch. */
  switchAt: number
  /** Local wall-clock peak windows, half-open [start, end). */
  windows: ReadonlyArray<readonly [number, number]>
}

const unitSchema = z.object({ hit: z.number(), miss: z.number(), out: z.number() }).strict()

/** Wire schema for the deepseekCost value (strict: drift fails loud in tests). */
const projectionSchema = z.object({
  version: z.literal(1),
  current: z.object({ provider: z.string().nullable(), model: z.string().nullable() }).strict(),
  supported: z.boolean(),
  period: z.enum(['flat', 'peak', 'offpeak']).nullable(),
  unit: unitSchema.nullable(),
  totals: z.object({ uncached: z.number().int().nonnegative(), read: z.number().int().nonnegative(), out: z.number().int().nonnegative() }).strict(),
  cost: z.number().nonnegative(),
  hitRate: z.number().nonnegative().nullable(),
  byModel: z.array(z.object({
    model: z.string(),
    uncached: z.number().int().nonnegative(),
    read: z.number().int().nonnegative(),
    out: z.number().int().nonnegative(),
    cost: z.number().nonnegative(),
  }).strict()),
  table: z.record(z.string(), z.object({
    flat: unitSchema,
    peak: unitSchema,
    offpeak: unitSchema,
  }).strict()),
  switchAt: z.number().int().nonnegative(),
  peakWindows: z.array(z.tuple([z.number(), z.number()])),
}).strict() as unknown as z.ZodType<DeepseekCostProjection>

const emptyState = (): CostState => ({
  current: { provider: null, model: null },
  byModel: {},
  settledStep: null,
})

/**
 * Settle one step's exact usage exactly once. The same step can report usage
 * both in a trailing `usage` stream chunk and on the assembled
 * `assistant/message`; the (turn, step) guard keeps the accounting single.
 */
function settleStep(
  state: CostState,
  turn: number,
  step: number,
  usage: TokenUsage,
  time: number,
  deps: CostProjectionDeps,
): CostState {
  const key = { turn, step }
  const settled = state.settledStep
  if (settled !== null && settled.turn === turn && settled.step === step) return state
  return settle({ ...state, settledStep: key }, usage, time, deps)
}

/** Attribute one exact usage sample to the model in force, priced at `time`. */
function settle(
  state: CostState,
  usage: TokenUsage,
  time: number,
  deps: CostProjectionDeps,
): CostState {
  const model = state.current.model ?? '(unknown)'
  const uncached = usage.inputTokens
  const read = usage.cacheReadTokens ?? 0
  const out = usage.outputTokens
  const cells = cellsFor(model, new Date(time), deps.table, deps.switchAt, deps.windows)
  const cost = cells === undefined ? 0 : costOf(cells, uncached, read, out)
  const previous = state.byModel[model] ?? { uncached: 0, read: 0, out: 0, cost: 0 }
  return {
    ...state,
    byModel: {
      ...state.byModel,
      [model]: {
        uncached: previous.uncached + uncached,
        read: previous.read + read,
        out: previous.out + out,
        cost: previous.cost + cost,
      },
    },
  }
}

/** The whole current value for one state, computed against `now`. */
export function viewCost(state: CostState, now: Date, deps: CostProjectionDeps): DeepseekCostProjection {
  const model = state.current.model
  const entry = model === null ? undefined : deps.table[model]
  const totals = Object.values(state.byModel).reduce(
    (acc, row) => ({ uncached: acc.uncached + row.uncached, read: acc.read + row.read, out: acc.out + row.out }),
    { uncached: 0, read: 0, out: 0 },
  )
  const cost = Object.values(state.byModel).reduce((sum, row) => sum + row.cost, 0)
  const byModel = Object.entries(state.byModel)
    .map(([key, row]) => ({ model: key, ...row }))
    .sort((a, b) => a.model.localeCompare(b.model))
  const period = model === null || entry === undefined ? null : periodAt(now, deps)
  return {
    version: 1,
    current: state.current,
    supported: entry !== undefined,
    period,
    unit: model === null || entry === undefined || period === null ? null : entry[period],
    totals,
    cost,
    hitRate: hitRateOf(totals.uncached, totals.read),
    byModel,
    table: deps.table,
    switchAt: deps.switchAt,
    peakWindows: deps.windows.map(([start, end]) => [start, end]),
  }
}

/** The price period in effect at one instant under the resolved regime knobs. */
function periodAt(now: Date, deps: CostProjectionDeps): 'flat' | 'peak' | 'offpeak' {
  if (deps.switchAt > now.getTime()) return 'flat'
  const hour = now.getHours()
  return deps.windows.some(([start, end]) => hour >= start && hour < end) ? 'peak' : 'offpeak'
}

/**
 * Create the replayable cost projection definition.
 * @param deps - resolved price table, regime switch, and peak windows.
 * @returns the `deepseekCost` projection definition.
 */
export function createCostProjectionDefinition(
  deps: CostProjectionDeps,
  config: CostOverlayConfig = {},
): ProjectionDefinition<'deepseekCost', CostState> {
  void config
  return {
    key: 'deepseekCost',
    schema: projectionSchema,
    init: emptyState,
    apply: (state, event: SessionEvent) => {
      let next = state
      if (event.type === 'request/header') {
        const header = event.data.header
        next = {
          ...next,
          current: {
            provider: header.config.provider ?? null,
            model: header.config.model ?? null,
          },
        }
      } else if (event.type === 'step/start') {
        next = { ...next, settledStep: null }
      } else if (event.type === 'assistant/chunk') {
        const { chunk } = event.data
        if (chunk.type === 'usage') {
          next = settleStep(next, event.data.turn, event.data.step, chunk.usage, event.time, deps)
        }
      } else if (event.type === 'assistant/message') {
        const usage = event.data.usage
        if (usage !== undefined) {
          next = settleStep(next, event.data.turn, event.data.step, usage, event.time, deps)
        }
      } else if (event.type === 'turn/end') {
        next = { ...next, settledStep: null }
      }
      return next
    },
    view: (state) => viewCost(state, new Date(), deps),
    stateVersion: 1,
  }
}
