# Changelog

All notable changes to **dsh-cost-overlay** (`meat-daemon-404/dsh-cost-overlay`) are documented in this file.

## [0.2.0] - 2026-11-20

### Added
- **Context-Cache Savings & Markdown Cost Report Helpers (`src/core/pricing.ts`)**: Added `cacheSavingsOf()` and `exportCostMarkdown()` with full unit test coverage in `tests/pricing.spec.ts`.
- **DSH Plugin Hub & Marketplace Manifests (`marketplace.json`, `package.json#dsh`, `scripts/check-versions.mjs`)**: Added complete DSH 0.2.x release compatibility metadata (`0.2.0-rc.2` through `0.2.2-rc.1`), bilingual marketplace entry, and `pnpm run check` version parity verifier.
- **Bilingual Documentation (`README.en.md`, `CHANGELOG.md`)**: Added English architecture & quickstart guide.

### Fixed
- **Cross-Platform `.npmrc` Portability**: Removed hardcoded Windows `D:/dsh/` store and cache paths from repository `.npmrc` so `pnpm install` succeeds across Linux, macOS, Windows, and CI runners.
- **Repository Metadata**: Updated `package.json` `repository.url`, `homepage`, and `bugs.url` to point to `https://github.com/meat-daemon-404/dsh-cost-overlay`.

## [0.1.2] - 2026-08-16

### Added
- Pointer-capture drag positioning for the floating overlay bar with `localStorage` persistence and one-click top-center reset.

## [0.1.1] - 2026-08-16

### Fixed
- Declared `webServer` in host `inject` array and added `tests/boot-smoke.mjs`.

## [0.1.0] - 2026-08-16

### Added
- Initial release of `dsh-cost-overlay` (host `deepseekCost` projection + browser floating bar + settings card).
