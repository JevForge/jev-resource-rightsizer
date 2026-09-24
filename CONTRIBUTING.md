# Contributing

Thanks for helping improve JEV Resource RightSizer.

## Prerequisites

* Node.js 24+
* npm

## Setup

```bash
git clone https://github.com/JevForge/jev-resource-rightsizer.git
cd jev-resource-rightsizer
npm ci
```

## Develop

```bash
npm run typecheck
npm test
npm run build
npm run all    # typecheck + coverage thresholds + build
```

Consumers execute `dist/index.js`. Keep `dist/` committed and in sync with `src/` (`git diff --exit-code -- dist` in CI).

## Pull requests

1. Branch from `main`.
2. Add or update tests under `tests/` for behavior changes.
3. Update README / docs when inputs, outputs, or behavior change.
4. Ensure `npm run all` passes.
5. Do not commit secrets (`.env`, keys, tokens).
6. Do not add silent Jev provider fallbacks.
7. Do not add executors that mutate cloud, Kubernetes, or Terraform state.

Public docs and runtime messages are English.

## Issues

Use the bug / feature templates. **Never** paste API keys, tokens, credentials, or private metrics labels that contain secrets.
