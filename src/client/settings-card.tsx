/**
 * The plugin settings card: master switch plus per-cell price overrides,
 * staged over the `dsh-cost-overlay` settings namespace. Registers into the
 * `web-ui.plugin.item` slot the plugin-configuration section renders (the
 * same seat the dsh-web-ui family's settings cards use).
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { CSSProperties } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the locale plugin's Context merge and the slot tables.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings-scope Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { COST_NS, priceField } from '../core/types.ts'
import { KNOWN_MODELS, PRICE_CELLS, PRICE_PERIODS } from '../core/pricing.ts'
import type { PriceCells } from '../core/pricing.ts'
import {
  booleanField,
  numberField,
  type CardActions,
  type CardShell,
  type FieldState as CardFieldState,
  StagedForm,
} from './settings-form.ts'
import type { CostKey } from './locales.ts'

/** Locale namespace this plugin owns. */
const NS = 'dsh-cost-overlay'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-cost-overlay settings-card copy. */
    'dsh-cost-overlay': CostKey
  }

  interface SlotMap {
    /**
     * The child slot the Web UI plugin group declares; this card registers
     * into the group instead of the top-level `settings.plugin.item` list.
     * Spelled here with the same shape so this package can register without
     * depending on the sibling UI package.
     */
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

/** The fields this card edits (the namespace's full schema). */
export interface CostSettingsSection {
  enabled?: boolean
  /** Dotted price overrides (e.g. `deepseek-v4-flash.peak.hit`). */
  [field: string]: unknown
}

/** What the cost-overlay card renders. */
export interface CostSettingsCardState extends CardShell {
  enabled: CardFieldState
  /** priceField -> field state. */
  cells: Record<string, CardFieldState>
}

/** The registration-side face the card's slot entry injects. */
export interface CostSettingsCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useCostSettingsCard. */
    costSettingsCard: SnapshotStore<CostSettingsCardState>
  }
}

/** Bridges the `dsh-cost-overlay` scope onto the card's staged form. */
export class CostSettingsCardController {
  private readonly form: StagedForm<CostSettingsSection>
  private readonly store: SnapshotStore<CostSettingsCardState>

  /** @param scope - the bound settings scope for the `dsh-cost-overlay` namespace. */
  constructor(scope: SettingsScope<CostSettingsSection>) {
    const specs = [
      booleanField('enabled'),
      ...KNOWN_MODELS.flatMap(model =>
        PRICE_PERIODS.flatMap(period =>
          PRICE_CELLS.map(cell => numberField(priceField(model, period, cell), { min: 0 }))),
      ),
    ]
    this.form = new StagedForm(scope, specs)
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): CostSettingsCardState {
    const cells: Record<string, CardFieldState> = {}
    for (const model of KNOWN_MODELS) {
      for (const period of PRICE_PERIODS) {
        for (const cell of PRICE_CELLS) {
          cells[priceField(model, period, cell)] = this.form.field(priceField(model, period, cell))
        }
      }
    }
    return {
      ...this.form.shell(),
      enabled: this.form.field('enabled'),
      cells,
    }
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): CostSettingsCardFace {
    return { hooks: { costSettingsCard: this.store }, ...this.form.actions() }
  }
}

/** Props the renderer binds for the cost-overlay card. */
export type CostSettingsCardProps =
  PropsRuntime<'web-ui.plugin.item'>
  & PropsLocale<'dsh-cost-overlay'>
  & InjectFace<CostSettingsCardFace>

/** Card chrome styling (inline; theme tokens with fallbacks). */
const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '14px 16px',
  borderRadius: '12px',
  border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))',
  background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.03))',
  color: 'var(--dsw-alias-label-primary, #e8eaed)',
  fontSize: '13px',
}

const inputStyle: CSSProperties = {
  width: '72px',
  padding: '3px 8px',
  borderRadius: '6px',
  border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.16))',
  background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06))',
  color: 'var(--dsw-alias-label-primary, #e8eaed)',
  fontVariantNumeric: 'tabular-nums',
}

const actionButton = (primary: boolean): CSSProperties => ({
  padding: '4px 14px',
  borderRadius: '6px',
  border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.16))',
  background: primary
    ? 'var(--dsw-alias-button-primary-fill, rgba(76,130,255,0.9))'
    : 'transparent',
  color: primary ? 'var(--dsw-alias-label-primary-foreground, #fff)' : 'var(--dsw-alias-label-secondary, #9aa0ac)',
  fontSize: '12px',
  cursor: 'pointer',
})

/** One model's three period groups, each with three cell inputs. */
function ModelGroup(props: {
  model: string
  state: CostSettingsCardState
  disabled: boolean
  resetLabel: string
  groupLabels: Record<string, string>
  cellLabels: Record<string, string>
  onEdit: (field: string, text: string) => void
  onReset: (field: string) => void
}) {
  const { model, state, disabled } = props
  return (
    <div style={{ borderTop: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))', paddingTop: '8px' }}>
      <div style={{ fontWeight: 700, marginBottom: '6px' }}>{model}</div>
      {PRICE_PERIODS.map(period => (
        <div key={period} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{ width: '170px', color: 'var(--dsw-alias-label-secondary, #9aa0ac)' }}>
            {props.groupLabels[period]}
          </span>
          {PRICE_CELLS.map(cell => {
            const field = priceField(model, period, cell)
            const fieldState = state.cells[field]
            if (fieldState === undefined) return null
            return (
              <label key={cell} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary, #6b7280)' }}>{props.cellLabels[cell]}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={fieldState.text}
                  disabled={disabled}
                  placeholder="默认"
                  aria-label={`${model} ${period} ${cell}`}
                  style={{
                    ...inputStyle,
                    ...(fieldState.invalid ? { borderColor: 'var(--dsw-alias-state-error-primary, #ff5f57)' } : {}),
                  }}
                  onChange={event => props.onEdit(field, event.target.value)}
                />
                {fieldState.overridden && (
                  <button
                    type="button"
                    disabled={disabled}
                    title={props.resetLabel}
                    onClick={() => props.onReset(field)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--dsw-alias-label-tertiary, #6b7280)' }}
                  >
                    ×
                  </button>
                )}
              </label>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * Render the cost-overlay settings card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function CostSettingsCard(props: CostSettingsCardProps) {
  const { t } = props
  const state = props.useCostSettingsCard(snapshot => snapshot)
  if (!state.available) return null
  const disabled = !state.writable
  const resetLabel = t('settings.reset')
  const invalidLabel = t('settings.invalidNumber')
  const groupLabels: Record<string, string> = {
    flat: t('settings.group.flat'),
    peak: t('settings.group.peak'),
    offpeak: t('settings.group.offpeak'),
  }
  const cellLabels: Record<string, string> = {
    hit: t('settings.cell.hit'),
    miss: t('settings.cell.miss'),
    out: t('settings.cell.out'),
  }

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 700, fontSize: '14px' }}>{t('settings.title')}</div>
      <div style={{ color: 'var(--dsw-alias-label-secondary, #9aa0ac)', fontSize: '12px' }}>
        {t('settings.description')}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>{t('settings.enabled')}</span>
        <select
          value={state.enabled.text === '' ? 'true' : state.enabled.text}
          disabled={disabled}
          onChange={event => props.edit('enabled', event.target.value)}
          style={inputStyle}
        >
          <option value="true">{t('settings.on')}</option>
          <option value="false">{t('settings.off')}</option>
        </select>
        <span style={{ color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '12px' }}>
          {t('settings.enabledHint')}
        </span>
      </label>

      <div style={{ color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '12px' }}>
        {t('settings.fieldsHint')}
      </div>

      {KNOWN_MODELS.map(model => (
        <ModelGroup
          key={model}
          model={model}
          state={state}
          disabled={disabled}
          resetLabel={resetLabel}
          groupLabels={groupLabels}
          cellLabels={cellLabels}
          onEdit={props.edit}
          onReset={props.resetField}
        />
      ))}

      {state.invalid && (
        <div style={{ color: 'var(--dsw-alias-state-error-primary, #ff5f57)', fontSize: '12px' }}>
          {invalidLabel}
        </div>
      )}
      {state.failed && (
        <div style={{ color: 'var(--dsw-alias-state-error-primary, #ff5f57)', fontSize: '12px' }}>
          {t('settings.failed')}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          disabled={disabled || state.saving || state.invalid || !state.dirty}
          onClick={props.save}
          style={actionButton(true)}
        >
          {state.saving ? t('settings.saving') : t('settings.save')}
        </button>
        <button
          type="button"
          disabled={disabled || (!state.dirty && !state.failed)}
          onClick={props.discard}
          style={actionButton(false)}
        >
          {t('settings.discard')}
        </button>
      </div>
    </div>
  )
}

/**
 * Mount the settings card into the plugin-configuration section.
 * @param ctx - client root context (slots, settingsScope).
 * @returns disposer removing the card.
 */
export function mountSettingsCard(ctx: ClientContext): () => void {
  const controller = new CostSettingsCardController(
    ctx.settingsScope.bind<CostSettingsSection>({ namespace: COST_NS }),
  )
  return ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item',
    id: 'cost-overlay',
    order: 120,
    locale: NS,
    inject: () => controller.inject(),
  }, CostSettingsCard))
}
