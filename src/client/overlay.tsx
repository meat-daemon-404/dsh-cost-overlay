/**
 * The top-center cost overlay, registered into the session header's additive
 * `conversation.session.header.utilities` seat. The seat renders inside the
 * session header, and the component pins itself to the top-center of the
 * viewport with `position: fixed` — visually a frame-wide overlay, fed by the
 * framework's session standard kit (`useProjection`) so it re-renders on
 * projection frames and session switches for free. A local clock ticker keeps
 * the peak/valley unit prices fresh across hour boundaries without any host
 * round-trip.
 */

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the header utilities
// seat) and the locale Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { formatUnit, formatYuan, periodOf } from '../core/pricing.ts'
import type { PricePeriod } from '../core/pricing.ts'
import { RECOMPUTE_PATH } from '../core/protocol.ts'
import type { DeepseekCostProjection } from '../core/types.ts'
import { zh as ZH_DICT, type CostKey } from './locales.ts'

/** The projection key this overlay reads. */
const COST_PROJECTION_KEY = 'deepseekCost'

/** Re-render cadence for the period ticker (also keeps the clock honest). */
const TICK_MS = 30_000

/** How long the "recomputed" feedback stays visible. */
const RECOMPUTED_MS = 2_500

const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  top: '10px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 2147483000,
  boxSizing: 'border-box',
  fontFamily: 'var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif)',
}

const BAR_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  borderRadius: '999px',
  background: 'var(--dsw-alias-bg-overlay, rgba(24, 26, 32, 0.94))',
  border: '1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14))',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.28)',
  cursor: 'pointer',
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-primary, #e8eaed)',
  whiteSpace: 'nowrap',
  userSelect: 'none',
}

const PERIOD_STYLE: Record<PricePeriod | 'none', CSSProperties> = {
  peak: {
    padding: '1px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--dsw-alias-state-warn-primary, #ff8f3d)',
    background: 'var(--dsw-alias-state-warn-tertiary, rgba(255, 143, 61, 0.16))',
  },
  offpeak: {
    padding: '1px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--dsw-alias-state-success-primary, #34c77b)',
    background: 'var(--dsw-alias-state-success-tertiary, rgba(52, 199, 123, 0.16))',
  },
  flat: {
    padding: '1px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--dsw-alias-label-secondary, #9aa0ac)',
    background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.08))',
  },
  none: {},
}

const TEXT_SECONDARY: CSSProperties = { color: 'var(--dsw-alias-label-secondary, #9aa0ac)' }
const TEXT_TERTIARY: CSSProperties = { color: 'var(--dsw-alias-label-tertiary, #6b7280)' }
const NUM = { fontVariantNumeric: 'tabular-nums' as const }

/** The full props the slot renderer binds (session kit + owner share). */
export type CostOverlaySlotProps = PropsRuntime<'conversation.session.header.utilities'>

/** Format a token count with thousands separators. */
export function formatTokens(value: number): string {
  return value.toLocaleString('en-US')
}

/** The period label for one period key. */
function periodLabel(period: PricePeriod | undefined, t: Record<CostKey, string>): string {
  if (period === 'peak') return t['overlay.peak']
  if (period === 'offpeak') return t['overlay.offpeak']
  if (period === 'flat') return t['overlay.flat']
  return '-'
}

/**
 * The compact bar plus the click-to-expand detail panel.
 * @param props - the session standard kit (useProjection) plus the owner share.
 * @returns the overlay tree (null when there is nothing to show).
 */
export function CostOverlaySlot(props: CostOverlaySlotProps) {
  const [now, setNow] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)
  const [recomputeState, setRecomputeState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')

  // The period ticker: peak/valley unit prices flip at the hour boundary.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const raw = props.useProjection(COST_PROJECTION_KEY)
  const value = typeof raw === 'object' && raw !== null ? raw as DeepseekCostProjection : undefined

  const view = useMemo(() => {
    if (value === undefined || !value.supported) return null
    const model = value.current.model
    const entry = model === null ? undefined : value.table[model]
    if (model === null || entry === undefined) return { model, period: undefined, unit: null, value }
    const windows = value.peakWindows.map(pair => [pair[0] ?? 0, pair[1] ?? 0] as const)
    const period = periodOf(model, new Date(now), value.table, value.switchAt, windows)
    const unit = period === undefined ? null : entry[period]
    return { model, period, unit, value }
  }, [value, now])

  if (view === null) return null
  const { model, period, unit, value: data } = view

  const runRecompute = async (): Promise<void> => {
    setRecomputeState('busy')
    try {
      const response = await fetch(RECOMPUTE_PATH, { method: 'POST' })
      setRecomputeState(response.ok ? 'done' : 'failed')
    } catch {
      setRecomputeState('failed')
    }
    window.setTimeout(() => setRecomputeState('idle'), RECOMPUTED_MS)
  }

  const t: Record<CostKey, string> = ZH_DICT

  return (
    <div style={OVERLAY_STYLE}>
      <div
        role="button"
        aria-expanded={expanded}
        style={BAR_STYLE}
        onClick={() => setExpanded(prev => !prev)}
      >
        {period !== undefined && (
          <span style={PERIOD_STYLE[period]}>{periodLabel(period, t)}</span>
        )}
        <span style={{ fontWeight: 600 }}>{model}</span>
        {unit !== null && (
          <span style={TEXT_SECONDARY}>
            命中 ¥{formatUnit(unit.hit)} 未命中 ¥{formatUnit(unit.miss)} 输出 ¥{formatUnit(unit.out)} {t['overlay.perMillion']}
          </span>
        )}
        <span style={{ fontWeight: 600, ...NUM }}>
          {t['overlay.cost']} ¥{formatYuan(data.cost)}
        </span>
        {data.hitRate !== null && (
          <span style={TEXT_TERTIARY}>
            {t['overlay.hitRate']} {Math.round(data.hitRate * 100)}%
          </span>
        )}
        <span style={{ ...TEXT_TERTIARY, fontSize: '10px' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{
          marginTop: '6px',
          width: '420px',
          maxWidth: 'calc(100vw - 32px)',
          borderRadius: '12px',
          background: 'var(--dsw-alias-bg-overlay, rgba(24, 26, 32, 0.97))',
          border: '1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14))',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
          color: 'var(--dsw-alias-label-primary, #e8eaed)',
          fontSize: '12px',
          lineHeight: '20px',
          padding: '14px 16px',
        }}>
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
            {t['overlay.detail.title']}
            {recomputeState === 'done' && <span style={{ color: 'var(--dsw-alias-state-success-primary, #34c77b)', marginLeft: '8px', fontWeight: 500 }}>{t['overlay.detail.recomputed']}</span>}
            {recomputeState === 'failed' && <span style={{ color: 'var(--dsw-alias-state-error-primary, #ff5f57)', marginLeft: '8px', fontWeight: 500 }}>{t['overlay.detail.recomputeFailed']}</span>}
          </div>

          <Row label={t['overlay.model']} value={model ?? '-'} />
          <Row label={t['overlay.period']} value={periodLabel(period, t)} />

          <SectionTitle>{t['overlay.detail.usage']}</SectionTitle>
          <Row label={t['overlay.detail.uncached']} value={`${formatTokens(data.totals.uncached)} tok`} />
          <Row label={t['overlay.detail.cacheRead']} value={`${formatTokens(data.totals.read)} tok`} />
          <Row label={t['overlay.detail.output']} value={`${formatTokens(data.totals.out)} tok`} />
          <Row label={t['overlay.hitRate']} value={data.hitRate === null ? '-' : `${Math.round(data.hitRate * 100)}%`} />
          <Row label={t['overlay.cost']} value={`¥${formatYuan(data.cost)}`} strong />

          {data.byModel.length > 1 && (
            <>
              <SectionTitle>{t['overlay.detail.byModel']}</SectionTitle>
              {data.byModel.map(row => (
                <Row
                  key={row.model}
                  label={`${row.model}（${formatTokens(row.uncached + row.read)} in / ${formatTokens(row.out)} out）`}
                  value={`¥${formatYuan(row.cost)}`}
                />
              ))}
            </>
          )}

          <SectionTitle>{t['overlay.detail.table']}</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...NUM }}>
            <thead>
              <tr style={TEXT_TERTIARY}>
                <th style={thStyle}>{t['overlay.model']} / {t['overlay.period']}</th>
                <th style={thStyle}>{t['overlay.hit']}</th>
                <th style={thStyle}>{t['overlay.miss']}</th>
                <th style={thStyle}>{t['overlay.out']}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.table).map(([modelId, entry]) => (
                <TableRows key={modelId} modelId={modelId} entry={entry} t={t} />
              ))}
            </tbody>
          </table>
          <div style={{ ...TEXT_TERTIARY, marginTop: '8px' }}>
            {t['overlay.detail.periodFlat']} · {t['overlay.detail.periodPeak']} · {t['overlay.detail.periodOffpeak']}
          </div>
          <div style={{ ...TEXT_TERTIARY, marginTop: '4px' }}>
            {t['overlay.detail.source']}。{t['overlay.detail.switchNote']}。
          </div>

          <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              disabled={recomputeState === 'busy'}
              onClick={() => void runRecompute()}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.16))',
                background: 'var(--dsw-alias-button-primary-fill, rgba(76,130,255,0.9))',
                color: 'var(--dsw-alias-label-primary-foreground, #fff)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {recomputeState === 'busy' ? '…' : t['overlay.detail.recompute']}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle: CSSProperties = { textAlign: 'right', fontWeight: 500, padding: '2px 6px' }

/** One model's three price rows inside the table. */
function TableRows(props: {
  modelId: string
  entry: { flat: { hit: number; miss: number; out: number }; peak: { hit: number; miss: number; out: number }; offpeak: { hit: number; miss: number; out: number } }
  t: Record<CostKey, string>
}) {
  const { modelId, entry, t } = props
  const rows: Array<{ label: string; cells: { hit: number; miss: number; out: number } }> = [
    { label: `${modelId} · ${t['overlay.flat']}`, cells: entry.flat },
    { label: `${modelId} · ${t['overlay.peak']}`, cells: entry.peak },
    { label: `${modelId} · ${t['overlay.offpeak']}`, cells: entry.offpeak },
  ]
  return (
    <>
      {rows.map(row => (
        <tr key={row.label}>
          <td style={tdStyle}>{row.label}</td>
          <td style={tdNum}>{formatUnit(row.cells.hit)}</td>
          <td style={tdNum}>{formatUnit(row.cells.miss)}</td>
          <td style={tdNum}>{formatUnit(row.cells.out)}</td>
        </tr>
      ))}
    </>
  )
}

const tdStyle: CSSProperties = { textAlign: 'left', padding: '2px 6px' }
const tdNum: CSSProperties = { textAlign: 'right', padding: '2px 6px', fontVariantNumeric: 'tabular-nums' }

/** One key/value row inside the detail panel. */
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
      <span style={TEXT_SECONDARY}>{label}</span>
      <span style={strong ? { fontWeight: 700, ...NUM } : NUM}>{value}</span>
    </div>
  )
}

/** A section divider label. */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{
      margin: '10px 0 4px',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.04em',
      color: 'var(--dsw-alias-label-tertiary, #6b7280)',
      borderTop: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))',
      paddingTop: '8px',
    }}>
      {children}
    </div>
  )
}

/**
 * Register the overlay into the session header's additive utilities seat.
 * @param ctx - client root context (slots).
 * @returns disposer removing the overlay entry.
 */
export function mountOverlay(ctx: ClientContext): () => void {
  return ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'cost-overlay',
    order: 10,
  }, CostOverlaySlot))
}
