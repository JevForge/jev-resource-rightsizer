# Test feature: resource-rightsizer evolution

Date: 2026-09-24

## Commands

- `npm run all` — PASS: typecheck, 17 Vitest files / 62 tests, coverage, and build.
- `node scripts/smoke-e2e.mjs` — PASS: real bundled `dist/index.js` against local HTTP provider mock and golden fixture.
- `git diff --check` — PASS.

## Critical-case map

| Acceptance case | Evidence |
| --- | --- |
| Filters preserve visible resources and exclude them from decisions | `tests/unit/resource-filters.test.ts` |
| Batch connectors, multiple resources/metrics, units, and pagination | `tests/unit/connector-batch.test.ts` plus existing connector tests |
| Per-resource recommendations in mixed fleets | `tests/unit/per-resource.test.ts` |
| Threshold profiles and environment defaults | `tests/unit/threshold-profiles.test.ts` |
| Trend slope and isolated-spike behavior | `tests/unit/trend-cost.test.ts` |
| Cost bridge remains explicitly estimated | `tests/unit/trend-cost.test.ts` |
| Loopback-only HTTP provider mock and golden workflow | `tests/contract/providers.test.ts`, `tests/unit/smoke-contract.test.ts`, `scripts/smoke-e2e.mjs` |
| HTTP connector failures and secret-safe actionable errors | `tests/unit/coverage-gaps.test.ts`, existing error tests |

## Gates

- Vitest: ran.
- Web/browser: skipped; this is an Action/connector repository with no web UI.
- API contracts: ran through provider and decision contract tests.

## Verdict

PASS for the implemented local artifact. Remote GitHub release publication was not
performed; it requires pushing the locally created tags or running the existing
release workflow.
