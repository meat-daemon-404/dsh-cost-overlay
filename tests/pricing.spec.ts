import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PEAK_WINDOWS,
  DEFAULT_PRICE_TABLE,
  DEFAULT_REGIME_SWITCH_AT,
  costOf,
  formatUnit,
  formatYuan,
  hitRateOf,
  isPeakHour,
  periodOf,
  regimeAt,
} from '../src/core/pricing.ts'

/** A fixed instant: 2026-08-16 12:00 local (flat regime, before the switch). */
const FLAT_NOON = new Date(2026, 7, 16, 12, 0, 0)
/** A fixed instant: 2026-08-17 10:00 local (valley regime, peak window). */
const VALLEY_PEAK = new Date(2026, 7, 17, 10, 0, 0)
/** A fixed instant: 2026-08-17 22:00 local (valley regime, idle window). */
const VALLEY_IDLE = new Date(2026, 7, 17, 22, 0, 0)

describe('regimeAt', () => {
  it('uses the flat regime before the official switch', () => {
    expect(regimeAt(FLAT_NOON, DEFAULT_REGIME_SWITCH_AT)).toBe('flat')
  })

  it('uses the valley regime from the switch on', () => {
    expect(regimeAt(VALLEY_PEAK, DEFAULT_REGIME_SWITCH_AT)).toBe('valley')
  })

  it('respects a custom switch instant', () => {
    expect(regimeAt(FLAT_NOON, FLAT_NOON.getTime() + 1)).toBe('flat')
    expect(regimeAt(FLAT_NOON, FLAT_NOON.getTime() - 1)).toBe('valley')
  })
})

describe('isPeakHour', () => {
  it('marks 9-12 and 14-18 as peak, everything else idle', () => {
    expect(isPeakHour(new Date(2026, 7, 17, 9, 0), DEFAULT_PEAK_WINDOWS)).toBe(true)
    expect(isPeakHour(new Date(2026, 7, 17, 11, 59), DEFAULT_PEAK_WINDOWS)).toBe(true)
    expect(isPeakHour(new Date(2026, 7, 17, 12, 0), DEFAULT_PEAK_WINDOWS)).toBe(false)
    expect(isPeakHour(new Date(2026, 7, 17, 13, 0), DEFAULT_PEAK_WINDOWS)).toBe(false)
    expect(isPeakHour(new Date(2026, 7, 17, 14, 0), DEFAULT_PEAK_WINDOWS)).toBe(true)
    expect(isPeakHour(new Date(2026, 7, 17, 18, 0), DEFAULT_PEAK_WINDOWS)).toBe(false)
    expect(isPeakHour(new Date(2026, 7, 17, 23, 59), DEFAULT_PEAK_WINDOWS)).toBe(false)
    expect(isPeakHour(new Date(2026, 7, 17, 0, 0), DEFAULT_PEAK_WINDOWS)).toBe(false)
  })

  it('honours custom windows', () => {
    expect(isPeakHour(new Date(2026, 7, 17, 3, 0), [[2, 4]])).toBe(true)
    expect(isPeakHour(new Date(2026, 7, 17, 5, 0), [[2, 4]])).toBe(false)
  })
})

describe('periodOf', () => {
  it('is flat before the switch regardless of the hour', () => {
    expect(periodOf('deepseek-v4-flash', FLAT_NOON, DEFAULT_PRICE_TABLE, DEFAULT_REGIME_SWITCH_AT, DEFAULT_PEAK_WINDOWS)).toBe('flat')
  })

  it('is peak in the 9-12 window after the switch', () => {
    expect(periodOf('deepseek-v4-flash', VALLEY_PEAK, DEFAULT_PRICE_TABLE, DEFAULT_REGIME_SWITCH_AT, DEFAULT_PEAK_WINDOWS)).toBe('peak')
  })

  it('is offpeak outside the windows after the switch', () => {
    expect(periodOf('deepseek-v4-flash', VALLEY_IDLE, DEFAULT_PRICE_TABLE, DEFAULT_REGIME_SWITCH_AT, DEFAULT_PEAK_WINDOWS)).toBe('offpeak')
  })

  it('is undefined for unknown models', () => {
    expect(periodOf('unknown-model', VALLEY_PEAK, DEFAULT_PRICE_TABLE, DEFAULT_REGIME_SWITCH_AT, DEFAULT_PEAK_WINDOWS)).toBeUndefined()
  })
})

describe('costOf', () => {
  it('bills the three disjoint buckets at their own cells', () => {
    const cells = { hit: 0.05, miss: 1.5, out: 4.5 }
    // 1M uncached input * 1.5 + 1M cached * 0.05 + 1M output * 4.5 = 6.05
    expect(costOf(cells, 1_000_000, 1_000_000, 1_000_000)).toBeCloseTo(6.05, 6)
  })

  it('returns zero for an empty sample', () => {
    expect(costOf({ hit: 1, miss: 1, out: 1 }, 0, 0, 0)).toBe(0)
  })

  it('scales with token counts', () => {
    expect(costOf({ hit: 0.1, miss: 3, out: 9 }, 100_000, 200_000, 50_000)).toBeCloseTo(0.3 + 0.02 + 0.45, 6)
  })
})

describe('hitRateOf', () => {
  it('is the cache-read share of billed input', () => {
    expect(hitRateOf(100, 300)).toBeCloseTo(0.75, 6)
  })

  it('is null when there is no input', () => {
    expect(hitRateOf(0, 0)).toBeNull()
  })
})

describe('formatYuan / formatUnit', () => {
  it('formats adaptively', () => {
    expect(formatYuan(1.234)).toBe('1.23')
    expect(formatYuan(0.012345)).toBe('0.0123')
    expect(formatYuan(0.00012345)).toBe('0.000123')
    expect(formatYuan(0)).toBe('0.00')
  })

  it('formats unit prices compactly', () => {
    expect(formatUnit(27)).toBe('27')
    expect(formatUnit(0.05)).toBe('0.05')
    expect(formatUnit(0.025)).toBe('0.03')
  })
})
