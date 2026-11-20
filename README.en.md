# dsh-cost-overlay — DeepSeek API Cost Overlay for DSH Web GUI

[简体中文文档](./README.md) · [Changelog](./CHANGELOG.md)

**dsh-cost-overlay** is a hot-pluggable **DeepSeek Harness (DSH) Web GUI** plugin that mounts a draggable floating bar at the top-center of the screen. It displays real-time DeepSeek API unit prices (CNY per 1M tokens, peak/off-peak & cache-hit aware) and folds the current session's exact token usage into an accumulated cost ledger—requiring zero DSH core changes and zero external API keys.

---

## Key Features

- **Draggable Top-Center Floating Pill**: Displays the active model, pricing regime badge (`Peak` / `Idle` / `Flat`), live unit prices (`hit` / `miss` / `out`), accumulated session cost, and cache-hit percentage. Click to expand the full per-model breakdown or drag anywhere on screen (persisted in `localStorage` with one-click reset).
- **Exact Event-Folded Accounting (`src/projection.ts`)**: Folds `request/header`, `assistant/chunk`, and `assistant/message` events with `(turn, step)` deduplication so mid-session model switches (`deepseek-v4-flash` ↔ `deepseek-v4-pro`) and regime boundary crossings are billed at the exact event timestamp.
- **Cache-Savings & Markdown Report Helpers (`src/core/pricing.ts`)**: Pure functions for computing context-cache savings (`cacheSavingsOf`) and generating Markdown session cost reports (`exportCostMarkdown`).
- **Live Settings Card (`src/client/settings-card.tsx`)**: Master toggle and per-cell price overrides under the `web-ui.plugin.item` slot, backed by a loopback-only (`127.0.0.1`) `/api/dsh-cost-overlay/recompute` endpoint.

---

## Development & Verification

```bash
pnpm install
pnpm run check      # verify manifest version parity (package.json & marketplace.json)
pnpm run typecheck  # tsc --noEmit
pnpm test           # vitest unit tests
pnpm run build      # emit lib/index.js, lib/client.js, and lib/types/
```

---

## License

Licensed under the [Apache License 2.0](./LICENSE).
