/**
 * Shared types and vocabulary for the dsh-cost-overlay plugin, compiled into
 * both the host half and the browser bundle (values are plain constants; the
 * projection type is wire JSON).
 */

import type { PriceCells, PricePeriod, PriceTable } from './pricing.ts'

/**
 * Declare the deepseekCost key on the merge-extensible projection type table
 * so host registration, the wire schema, and the client all share one key.
 */
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Per-session DeepSeek cost accounting (tokens, cost, prices, regime). */
    deepseekCost: DeepseekCostProjection
  }
}

/** Session-cumulative token buckets (disjoint, mirroring TokenUsageProjection). */
export interface CostTotals {
  /** 输入（缓存未命中）tokens */
  uncached: number
  /** 输入（缓存命中）tokens */
  read: number
  /** 输出 tokens */
  out: number
}

/** One model's session-cumulative usage and cost. */
export interface ModelCostRow extends CostTotals {
  /** Provider model id. */
  model: string
  /** Cumulative cost in yuan for this model. */
  cost: number
}

/**
 * The whole cost-overlay value the host projection publishes per session.
 * Wire JSON (schema-validated before it leaves the host).
 */
export interface DeepseekCostProjection {
  /** Projection value schema version. */
  version: 1
  /** The model/provider in force for the latest request header. */
  current: {
    provider: string | null
    model: string | null
  }
  /** Whether the current model has a price row (false hides the overlay). */
  supported: boolean
  /** The pricing period in effect for the current model right now. */
  period: PricePeriod | null
  /** Unit prices in effect right now, or null when the model is unlisted. */
  unit: PriceCells | null
  /** Session-cumulative token buckets across every model used. */
  totals: CostTotals
  /** Session-cumulative cost in yuan. */
  cost: number
  /** Cache-hit ratio over billed input, or null with no input. */
  hitRate: number | null
  /** Per-model rows, sorted by model id. */
  byModel: ModelCostRow[]
  /** The resolved price table (defaults plus user overrides) for the detail panel. */
  table: PriceTable
  /** Epoch ms of the flat -> peak/valley regime switch (always resolved). */
  switchAt: number
  /** Local wall-clock peak windows (half-open hour ranges). */
  peakWindows: number[][]
}

/** The plugin config surface: flat fields so the settings card stays simple. */
export interface CostOverlayConfig {
  /** Master switch (false unregisters the projection and hides the overlay). */
  enabled?: boolean
  /** Epoch ms of the flat -> peak/valley regime switch (default: official date). */
  switchAt?: number
  /** Peak windows as [start, end) local hours (default: [[9,12],[14,18]]). */
  peakWindows?: number[][]
  /** Dotted price overrides, e.g. `deepseek-v4-flash.peak.hit`. */
  [field: string]: unknown
}

/** Settings namespace of the plugin (spelled identically on both halves). */
export const COST_NS = 'dsh-cost-overlay'

/** Build one dotted price-override field name. */
export function priceField(model: string, period: PricePeriod, cell: keyof PriceCells): string {
  return `${model}.${period}.${cell}`
}

/** Every dotted price-override field name (2 models x 3 periods x 3 cells). */
export function priceFields(): string[] {
  const fields: string[] = []
  for (const model of ['deepseek-v4-flash', 'deepseek-v4-pro'] as const) {
    for (const period of ['flat', 'peak', 'offpeak'] as const) {
      for (const cell of ['hit', 'miss', 'out'] as const) fields.push(priceField(model, period, cell))
    }
  }
  return fields
}

/** Overlay data the browser needs that is not part of the wire projection. */
export interface OverlayRuntimeContext {
  /** Whether a session is current. */
  hasSession: boolean
  /** The current epoch time (updated by the period ticker). */
  now: number
}

export type { PriceCells, PricePeriod, PriceTable }
