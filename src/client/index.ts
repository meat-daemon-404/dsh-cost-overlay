/**
 * Browser half of the dsh-cost-overlay plugin — runs inside the dsh web GUI.
 *
 * Registers the locale dictionaries and mounts the two surfaces: the top-center
 * cost overlay (a fixed portal fed by the current session's deepseekCost
 * projection) and the plugin settings card (price overrides + master switch).
 * Failure policy: mounting problems are logged, never thrown — an external
 * plugin must not take the GUI down.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface SlotMap merge and the SlotMap table.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import { mountOverlay } from './overlay.tsx'
import { mountSettingsCard } from './settings-card.tsx'
import { en, zh } from './locales.ts'

/** Locale namespace this plugin owns. */
const NS = 'dsh-cost-overlay'

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Mount the overlay and the settings card.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-cost-overlay: dictionaries')

  const disposers: Array<() => void> = []
  try {
    disposers.push(mountOverlay(ctx))
    disposers.push(mountSettingsCard(ctx))
  } catch (error) {
    // DOM or service failures degrade the overlay, never the GUI.
    console.warn('[dsh-cost-overlay] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-cost-overlay: ui mounts')
}
