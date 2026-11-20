# Changelog

## [0.2.1] - 2026-11-20

### Added
- **Live Cache Savings Row & One-Click Report Copy in UI (`src/client/overlay.tsx`, `src/client/locales.ts`)**: Wired `cacheSavingsOf()` and `exportCostMarkdown()` from `src/core/pricing.ts` directly into the expanded overlay detail panel, displaying real-time cache savings (`缓存已省 ¥...`) and a one-click `复制费用报告` (`Copy cost report`) button.
- **Automated CI Workflow**: Added `.github/workflows/ci.yml` running the Node 22 TypeScript test suite on every push and pull request.

## [0.2.0] - 2026-04-18

### Added
- Added `cacheSavingsOf()` and `exportCostMarkdown()` in `src/core/pricing.ts`, plus expanded model pricing catalog (`deepseek-r1`, `claude-3-7-sonnet`, `gpt-4o`, `gpt-4o-mini`).
