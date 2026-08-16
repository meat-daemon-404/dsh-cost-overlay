/**
 * Standalone tsdown config for the dsh-cost-overlay plugin.
 *
 * Mirrors the dsh-web-ui family's shared client-bundle preset (shared/
 * tsdown.client.ts) without depending on that repository: the node half emits
 * lib/index.js + lib/invariant.js (ESM, cordis-externalized), and the browser
 * half emits lib/client.js as a closure-factory artifact for the GUI's
 * window.__ModuleLoader__ (CJS, platform modules external, everything else
 * inlined). Styles are inline (no CSS Modules), so no lightningcss plugin is
 * needed.
 */
import type { UserConfig } from 'tsdown'

/**
 * The shell's frozen module table (mirrors shared/web-platform.ts in the
 * dsh-web-ui family and packages/client/tsdown.client.ts in the DSH checkout).
 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
] as const

/** The documented runtime exemption: snapshot-store engine resolved from the module table. */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

/** Externals the browser bundle resolves through the loader's injected require. */
const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

/** Wire/type layers the client bundle may inline (no shared runtime identity). */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

/** Generated descriptor/codec contributions the client bundle may inline. */
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

/** Node-half externals: the cordis framework plus every @deepseek-ai service package. */
const LIB_EXTERNALS: readonly string[] = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-projection',
  '@deepseek-ai/dsh-settings',
]

const nodeLib: UserConfig = {
  name: 'dsh-cost-overlay',
  entry: ['src/index.ts', 'src/invariant.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
  external: LIB_EXTERNALS,
}

const clientBundle: UserConfig = {
  name: 'dsh-cost-overlay/client',
  entry: { client: 'src/client/index.ts' },
  // Browser bundle lands next to the node half (single lib/ artifact dir; the
  // entryFileNames pin keeps it exactly lib/client.js). clean stays off — a
  // default clean would wipe the node-half output emitted above.
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  // tsdown auto-externalizes package dependencies; anything NOT in the loader
  // module table must inline instead. A require() the table cannot answer is a
  // guaranteed runtime throw, so the rule is the table list itself.
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  plugins: [{
    // Bundle purity gate: platform seed entries stay external, inline-safe
    // wire layers inline, and every other @deepseek-ai value import is a build
    // error — a cross-plugin value import either inlines a duplicate runtime
    // instance or requires a specifier the frozen module table cannot answer.
    name: 'dsh-cost-overlay-client-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (CLIENT_EXTERNALS.includes(source)) return null
      if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is not a platform module, an inline-safe wire layer, `
        + 'or a generated /remote contribution — cross-plugin value imports are forbidden; '
        + 'collaborate through cordis services (type-only imports are erased and never reach this gate)',
      )
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-cost-overlay", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default () => [nodeLib, clientBundle]
