# dsh-cost-overlay (v0.2.1)

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://github.com/meat-daemon-404/dsh-cost-overlay)
[![Tests](https://img.shields.io/badge/Tests-41%2F41_Passing-2ea44f)](https://github.com/meat-daemon-404/dsh-cost-overlay)

> **Real-Time DeepSeek API Token Cost Overlay, Disk-Cache Savings Calculator & Markdown/CSV Audit Exporter for DeepSeek Harness (DSH) Web GUI**

## Overview

`dsh-cost-overlay` is a lightweight Cordis plugin for DeepSeek Harness (DSH) that hooks into every LLM turn and renders an unobtrusive, draggable cost telemetry HUD in the Web GUI. It tracks prompt cache hits vs. misses, reasoning tokens, off-peak discounts, and session burn rate in real time.

## Key Features (v0.2.1)

- **Multi-Model RMB Pricing Matrix (`src/core/pricing.ts`)**: Built-in rate table for `deepseek-chat` (V3), `deepseek-reasoner` (R1), `deepseek-v4-flash`, and `deepseek-v4-pro` with automatic Beijing time peak/off-peak (`00:30–08:30` UTC+8) discount calculation.
- **Context Disk-Cache Hit Savings (`cacheSavingsOf()`)**: Quantifies exact RMB saved (`savedRmb`) and percentage saved (`savedRatio`) from DeepSeek prefix cache hits (`0.1x`–`0.25x` input rate vs. cache miss rate) and highlights green `省 ¥...` badges in the HUD.
- **One-Click Markdown Audit Report (`exportCostMarkdown()`)**: Copies a clean, shareable Markdown cost breakdown table (total RMB, cache hit savings, cache hit rate, burn rate, and per-call ledger) directly to the clipboard from the overlay footer (`复制 MD 报告`), alongside CSV and JSON exports.
- **Budget Alert & Turn Projection**: Configurable session RMB threshold alert and projected hourly/session cost estimation.

## Installation & Usage

```bash
git clone https://github.com/meat-daemon-404/dsh-cost-overlay.git
cd dsh-cost-overlay
npm install

# Run the 41-test verification suite
npm test

# Build plugin bundle
npm run build
```

Register the plugin in your DSH `cordis.yml` configuration to enable the Web GUI cost overlay automatically.

## License

Licensed under the [Apache License 2.0](LICENSE).
