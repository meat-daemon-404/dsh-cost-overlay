/**
 * DeepSeek API pricing model: pure, dependency-free, shared by the host
 * projection (cost folding) and the browser overlay (period display).
 *
 * Source of truth: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 * captured on 2026-08-16. Two pricing regimes exist:
 *
 * - flat: the current uniform prices, in effect until the regime switch
 *   (Beijing time 2026-08-17 00:00).
 * - peak/valley: from the switch on, peak-hour prices and idle-hour prices
 *   (idle = half of peak). Peak windows are Beijing/local wall-clock hours
 *   9:00-12:00 and 14:00-18:00; all other hours are idle.
 *
 * All prices are yuan per 1,000,000 tokens. The three cells are disjoint:
 * `hit` bills cache-hit input tokens, `miss` bills uncached input tokens, and
 * `out` bills output tokens (DeepSeek has no separate cache-write fee).
 */

/** One model's three price cells (yuan per 1,000,000 tokens). */
export interface PriceCells {
  /** 百万 tokens 输入（缓存命中） */
  hit: number
  /** 百万 tokens 输入（缓存未命中） */
  miss: number
  /** 百万 tokens 输出 */
  out: number
}

/** The pricing regime in effect for one moment. */
export type PricePeriod = 'flat' | 'peak' | 'offpeak'

/** One model's prices across both regimes. */
export interface ModelPrice {
  /** Uniform prices before the regime switch. */
  flat: PriceCells
  /** Peak-hour prices after the regime switch. */
  peak: PriceCells
  /** Idle-hour prices after the regime switch. */
  offpeak: PriceCells
}

/** Model id -> price entry. Unknown models have no entry. */
export type PriceTable = Record<string, ModelPrice>

/** Default table captured from the official pricing page on 2026-08-16. */
export const DEFAULT_PRICE_TABLE: PriceTable = {
  'deepseek-v4-flash': {
    flat: { hit: 0.02, miss: 1.0, out: 2.0 },
    peak: { hit: 0.1, miss: 3.0, out: 9.0 },
    offpeak: { hit: 0.05, miss: 1.5, out: 4.5 },
  },
  'deepseek-v4-pro': {
    flat: { hit: 0.025, miss: 3.0, out: 6.0 },
    peak: { hit: 0.3, miss: 9.0, out: 27.0 },
    offpeak: { hit: 0.15, miss: 4.5, out: 13.5 },
  },
}

/**
 * The flat regime ends and peak/valley pricing begins at Beijing time
 * 2026-08-17 00:00, which is 2026-08-16T16:00Z (UTC+8).
 */
export const DEFAULT_REGIME_SWITCH_AT = Date.UTC(2026, 7, 16, 16, 0, 0)

/** Official peak windows in local wall-clock hours: 9:00-12:00 and 14:00-18:00. */
export const DEFAULT_PEAK_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [9, 12],
  [14, 18],
]

/** The three period labels a table row always carries. */
export const PRICE_PERIODS: readonly PricePeriod[] = ['flat', 'peak', 'offpeak']

/** The three price cells a period always carries. */
export const PRICE_CELLS: ReadonlyArray<keyof PriceCells> = ['hit', 'miss', 'out']

/** The two known DeepSeek models (the official table's rows). */
export const KNOWN_MODELS: readonly string[] = ['deepseek-v4-flash', 'deepseek-v4-pro']

/** The pricing regime in effect at `date` (before vs after the switch). */
export function regimeAt(date: Date, switchAt: number): 'flat' | 'valley' {
  return date.getTime() < switchAt ? 'flat' : 'valley'
}

/** True when the local wall-clock hour of `date` falls inside a peak window. */
export function isPeakHour(date: Date, windows: ReadonlyArray<readonly [number, number]>): boolean {
  const hour = date.getHours()
  return windows.some(([start, end]) => hour >= start && hour < end)
}

/** The price period in effect for one model at one moment. */
export function periodOf(
  model: string,
  date: Date,
  table: PriceTable,
  switchAt: number,
  windows: ReadonlyArray<readonly [number, number]>,
): PricePeriod | undefined {
  if (table[model] === undefined) return undefined
  return regimeAt(date, switchAt) === 'flat' ? 'flat' : isPeakHour(date, windows) ? 'peak' : 'offpeak'
}

/** The unit price cells in effect for one model at one moment, or undefined when the model is unlisted. */
export function cellsFor(
  model: string,
  date: Date,
  table: PriceTable,
  switchAt: number,
  windows: ReadonlyArray<readonly [number, number]>,
): PriceCells | undefined {
  const entry = table[model]
  if (entry === undefined) return undefined
  const period = periodOf(model, date, table, switchAt, windows)
  return period === undefined ? undefined : entry[period]
}

/**
 * Cost of one usage sample in yuan. The buckets are disjoint harness counts:
 * `uncached` bills at `miss`, `cacheRead` at `hit`, `output` at `out`.
 */
export function costOf(cells: PriceCells, uncached: number, cacheRead: number, output: number): number {
  return (uncached * cells.miss + cacheRead * cells.hit + output * cells.out) / 1_000_000
}

/** Cache-hit ratio over billed input tokens, or null when there is no input. */
export function hitRateOf(uncached: number, cacheRead: number): number | null {
  const input = uncached + cacheRead
  return input <= 0 ? null : cacheRead / input
}

/** Format a cost in yuan with adaptive precision (large amounts to cents, small amounts finer). */
export function formatYuan(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  if (abs === 0) return '0.00'
  if (abs >= 1) return value.toFixed(2)
  if (abs >= 0.01) return value.toFixed(4)
  if (abs >= 0.0001) return value.toFixed(6)
  return value.toFixed(8)
}

/** Format a unit price cell (yuan per 1M tokens) compactly. */
export function formatUnit(value: number): string {
  const abs = Math.abs(value)
  if (Number.isInteger(value)) return String(value)
  if (abs >= 1) return String(Math.round(value * 1000) / 1000)
  if (abs >= 0.01) return String(Math.round(value * 100) / 100)
  return String(value)
}
