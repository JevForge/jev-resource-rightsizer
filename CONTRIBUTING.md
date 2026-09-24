# Contributing

1. Use Node 24+.
2. `npm ci`
3. Add or update tests under `tests/` for behavior changes.
4. `npm run all` must pass (typecheck, coverage thresholds, build).
5. Keep `dist/` committed and in sync with `src/` (`git diff --exit-code -- dist` in CI).
6. Do not add silent Jev provider fallbacks.
7. Do not add executors that mutate cloud/Kubernetes/Terraform state.

Public docs and runtime messages are English. Maintainer chat may be Portuguese.
