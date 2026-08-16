/**
 * Boot smoke test: loads the built host half (lib/index.js) into a minimal
 * stub context and runs apply(), asserting the projection registers, the
 * recompute route registers, and nothing throws. Guards against the
 * undeclared-service class of boot failures.
 */
import { apply, resolveTable, resolveSwitchAt, resolveWindows } from '../lib/index.js'

/** A stub cordis-like context covering everything apply touches. */
function stubContext() {
  const registered = []
  const routes = []
  const effects = []
  const ctx = {
    sessionProjections: {
      register(def) {
        registered.push(def)
        return () => {
          const i = registered.indexOf(def)
          if (i >= 0) registered.splice(i, 1)
        }
      },
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const i = routes.indexOf(route)
          if (i >= 0) routes.splice(i, 1)
        }
      },
    },
    effect(fn, label) {
      effects.push(label)
      return fn
    },
    // cordis core: run a callback in a sub-context with the named services.
    // A service that is never provided holds the callback (never runs) — the
    // stub mimics that by skipping absent services.
    inject(services, fn) {
      for (const name of services) {
        if (ctx[name] === undefined) return undefined
      }
      return fn(ctx)
    },
    get: () => undefined,
  }
  return { ctx, registered, routes, effects }
}

const cases = []

// 1. apply with default config: registers one projection + one route.
{
  const { ctx, registered, routes } = stubContext()
  apply(ctx, {})
  cases.push(['registers deepseekCost projection', registered.length === 1 && registered[0].key === 'deepseekCost'])
  cases.push(['registers recompute route', routes.length === 1 && routes[0].path === '/api/dsh-cost-overlay/recompute'])
  cases.push(['route kind is exact', routes[0]?.kind === 'exact'])
  // The projection's fold+view works end to end.
  const def = registered[0]
  const header = {
    seq: 1, type: 'request/header', time: resolveSwitchAt({}) - 60_000,
    data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } }, reason: 'initial' },
  }
  const usage = {
    seq: 2, type: 'assistant/message', time: resolveSwitchAt({}) - 59_000,
    data: { turn: 1, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0 } },
  }
  let state = def.init()
  state = def.apply(state, header)
  state = def.apply(state, usage)
  const value = def.view(state)
  cases.push(['view reports flash supported', value.supported === true])
  cases.push(['view cost is 1.0 yuan (flat, 1M uncached)', Math.abs(value.cost - 1.0) < 1e-9])
  cases.push(['view totals uncached 1M', value.totals.uncached === 1_000_000])
  cases.push(['view carries the resolved table', value.table['deepseek-v4-flash']?.flat.miss === 1])
}

// 2. disabled config: no projection, route still registered.
{
  const { ctx, registered, routes } = stubContext()
  apply(ctx, { enabled: false })
  cases.push(['disabled config registers no projection', registered.length === 0])
  cases.push(['disabled config still registers the route', routes.length === 1])
}

// 3. price override flows into the fold.
{
  const { ctx, registered } = stubContext()
  apply(ctx, { 'deepseek-v4-flash.peak.hit': 0.99 })
  const def = registered[0]
  const state = def.init()
  const value = def.view(state)
  cases.push(['override lands in the resolved table', value.table['deepseek-v4-flash']?.peak.hit === 0.99])
}

// 4. resolveTable / resolveSwitchAt / resolveWindows sanity.
{
  const table = resolveTable({ 'deepseek-v4-pro.offpeak.out': 13 })
  cases.push(['resolveTable override', table['deepseek-v4-pro']?.offpeak.out === 13])
  cases.push(['resolveSwitchAt default', resolveSwitchAt({}) === Date.UTC(2026, 7, 16, 16, 0, 0)])
  cases.push(['resolveWindows default', JSON.stringify(resolveWindows({})) === '[[9,12],[14,18]]'])
}

let failed = 0
for (const [name, ok] of cases) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok' : 'FAIL'} - ${name}`)
}
if (failed > 0) {
  console.error(`boot smoke: ${failed} failure(s)`)
  process.exit(1)
}
console.log('boot smoke: all checks passed')
