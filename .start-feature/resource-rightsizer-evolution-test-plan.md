# Test plan: resource-rightsizer evolution

## Unit

- Filter matching, precedence, all-excluded failure, and visible excluded
  resources.
- Connector batch normalization for CloudWatch, Azure, GCP, and Prometheus:
  multiple metrics/resources, empty series, pagination, byte units, and GCP
  ratio-to-percent conversion.
- Prefix/actionability/redaction for 4xx, 5xx, and timeout failures.
- Per-resource recommendation matrix and global/heuristic compatibility.
- Profile defaults/overrides and validation of threshold relationships.
- Trend slope/window classification and isolated-spike behavior.
- Cost bridge estimate and no-cost behavior.

## Integration / contract

- `loadMetricsReport` through each connector using injected HTTP/client doubles.
- Decision schema accepts the new optional fields and still parses historical
  decisions.
- `runResourceRightsizer` preserves the global Jev policy while carrying the
  per-resource evidence.

## Smoke e2e

- `workflow_dispatch` starts a local mock HTTP provider, runs the bundled action
  against a golden fixture, and asserts the generated decision artifact.
- CI continues to run typecheck, coverage, build, and a clean `dist` diff.

## Required error paths

- Connector HTTP 401/403/404/429/500.
- Abort/timeout and malformed provider JSON.
- Missing credentials/configuration.
- Include filters matching no resources.
- Low/insufficient samples and mixed resource fleet.
