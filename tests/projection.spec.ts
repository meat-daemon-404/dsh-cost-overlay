import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createCostProjectionDefinition, viewCost, type CostState } from '../src/projection.ts'
import { DEFAULT_PRICE_TABLE, DEFAULT_REGIME_SWITCH_AT } from '../src/core/pricing.ts'
import { DEFAULT_PEAK_WINDOWS } from '../src/core/pricing.ts'

const DEPS = {
  table: DEFAULT_PRICE_TABLE,
  switchAt: DEFAULT_REGIME_SWITCH_AT,
  windows: DEFAULT_PEAK_WINDOWS,
}

/** A settled step: header + step/start + usage chunk + message + step/end. */
function settledStep(
  model: string,
  usage: { input?: number; cacheRead?: number; output?: number } = {},
  atMs = DEFAULT_REGIME_SWITCH_AT - 60_000,
): SessionEvent[] {
  const input = usage.input ?? 1000
  const cacheRead = usage.cacheRead ?? 500
  const output = usage.output ?? 200
  return [
    { seq: 1, type: 'request/header', time: atMs, data: { header: { config: { provider: 'deepseek-official', model } }, reason: 'initial' } } as unknown as SessionEvent,
    { seq: 2, type: 'step/start', time: atMs + 1, data: { turn: 1, step: 1 } } as unknown as SessionEvent,
    { seq: 3, type: 'assistant/chunk', time: atMs + 2, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead } } } } as unknown as SessionEvent,
    { seq: 4, type: 'assistant/message', time: atMs + 3, data: { turn: 1, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead } } } as unknown as SessionEvent,
    { seq: 5, type: 'step/end', time: atMs + 4, data: { turn: 1, step: 1 } } as unknown as SessionEvent,
  ]
}

/** Fold events through the definition and return the state + view. */
function fold(events: SessionEvent[]): { state: CostState; view: ReturnType<typeof viewCost> } {
  const definition = createCostProjectionDefinition(DEPS)
  let state = definition.init()
  for (const event of events) state = definition.apply(state, event)
  return { state, view: viewCost(state, new Date(), DEPS) }
}

describe('deepseekCost projection', () => {
  it('settles one step into the model bucket with cost priced at the event time', () => {
    const { view } = fold(settledStep('deepseek-v4-flash', { input: 1_000_000, cacheRead: 0, output: 500_000 }))
    expect(view.current.model).toBe('deepseek-v4-flash')
    expect(view.supported).toBe(true)
    expect(view.totals.uncached).toBe(1_000_000)
    expect(view.totals.read).toBe(0)
    expect(view.totals.out).toBe(500_000)
    // Flat regime before the switch: 1M * 1 + 0.5M * 2 = 2.0 yuan.
    expect(view.cost).toBeCloseTo(2.0, 6)
    expect(view.byModel).toHaveLength(1)
    expect(view.byModel[0]?.model).toBe('deepseek-v4-flash')
  })

  it('prices cache hits at the hit cell', () => {
    const { view } = fold(settledStep('deepseek-v4-flash', { input: 1_000_000, cacheRead: 1_000_000, output: 0 }))
    // 1M uncached * 1 + 1M cached * 0.02 = 1.02 yuan (flat regime).
    expect(view.cost).toBeCloseTo(1.02, 6)
    expect(view.hitRate).toBeCloseTo(0.5, 6)
  })

  it('does not double-count usage that appears on both chunk and message', () => {
    const { view } = fold(settledStep('deepseek-v4-flash', { input: 1000, cacheRead: 500, output: 200 }))
    expect(view.totals.uncached).toBe(1000)
    expect(view.totals.out).toBe(200)
  })

  it('attributes a model switch to per-model rows', () => {
    const events: SessionEvent[] = [
      ...settledStep('deepseek-v4-flash', { input: 1_000_000, cacheRead: 0, output: 0 }),
      // Second turn on a different model.
      { seq: 6, type: 'turn/end', time: DEFAULT_REGIME_SWITCH_AT - 50_000, data: { turn: 1, reason: { kind: 'completed' } } } as unknown as SessionEvent,
      { seq: 7, type: 'request/header', time: DEFAULT_REGIME_SWITCH_AT - 49_000, data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-pro' } }, reason: 'change' } } as unknown as SessionEvent,
      { seq: 8, type: 'step/start', time: DEFAULT_REGIME_SWITCH_AT - 48_000, data: { turn: 2, step: 1 } } as unknown as SessionEvent,
      { seq: 9, type: 'assistant/message', time: DEFAULT_REGIME_SWITCH_AT - 47_000, data: { turn: 2, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: 500_000, cacheReadTokens: 0, outputTokens: 0 } } } as unknown as SessionEvent,
    ]
    const { view } = fold(events)
    expect(view.byModel.map(row => row.model).sort()).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
    const flash = view.byModel.find(row => row.model === 'deepseek-v4-flash')
    const pro = view.byModel.find(row => row.model === 'deepseek-v4-pro')
    expect(flash?.cost).toBeCloseTo(1.0, 6)
    expect(pro?.cost).toBeCloseTo(1.5, 6)
    expect(view.totals.uncached).toBe(1_500_000)
  })

  it('reports an unsupported model as unsupported with zero cost', () => {
    const { view } = fold(settledStep('claude-sonnet', { input: 1000, output: 100 }))
    expect(view.supported).toBe(false)
    expect(view.cost).toBe(0)
    expect(view.totals.uncached).toBe(1000)
  })

  it('starts empty with no events', () => {
    const { view } = fold([])
    expect(view.current.model).toBeNull()
    expect(view.supported).toBe(false)
    expect(view.cost).toBe(0)
    expect(view.byModel).toHaveLength(0)
    expect(view.hitRate).toBeNull()
  })

  it('carries the resolved table and regime knobs for the client', () => {
    const { view } = fold(settledStep('deepseek-v4-flash'))
    expect(view.table['deepseek-v4-flash']?.peak.hit).toBeCloseTo(0.1, 6)
    expect(view.switchAt).toBe(DEFAULT_REGIME_SWITCH_AT)
    expect(view.peakWindows).toEqual([[9, 12], [14, 18]])
    expect(view.version).toBe(1)
  })
})
