# Changelog

## [Unreleased]

## 0.1.11 — 2026-09-24

### Added

* Add a manual provider-mock smoke workflow that runs the bundled Action against a golden fixture.
* Permit HTTP only for loopback custom-provider endpoints used by local smoke tests; external endpoints remain HTTPS-only.

## 0.1.10 — 2026-09-24

### Added

* Add ordered metric trend slope/window evidence and `TREND_RISING` / `TREND_FALLING` reasons.
* Add typed optional cost impact estimates derived from `cost_hourly` / `cost_monthly`.

## 0.1.9 — 2026-09-24

### Added

* Add `conservative`, `balanced`, and `aggressive` threshold profiles with environment-aware defaults.
* Expose the selected `threshold_profile` in the decision contract and Action outputs.

## 0.1.8 — 2026-09-24

### Added

* Add `per_resource_recommendations` while retaining one global Jev decision.
* Preserve filtered resources as `review`/`RESOURCE_FILTERED` in the per-resource evidence.

## 0.1.7 — 2026-09-24

### Added

* Expand CloudWatch, Azure Monitor, GCP Monitoring, and Prometheus connectors to a batch-of-metrics-per-resource contract.
* Normalize provider units explicitly, including GCP ratios to percent and byte-valued memory metrics.
* Follow Azure/GCP pagination and retain provider failures as prefixed, actionable errors.

## 0.1.6 — 2026-09-24

### Added

* Add include/exclude resource filters matched against resource id, service, or resource kind.

## 0.1.5 — 2026-09-24

### Added

* Expose `heuristic_recommendation` output (deterministic baseline alongside Jev's final recommendation).

## 0.1.4 — 2026-09-24

### Added

* Expand unit coverage for load validation, GitHub label/check/comment executors, and connector HTTP failures.

## 0.1.3 — 2026-09-24

### Changed

* Standardize connector and validation errors with `[JEV Resource RightSizer]` and actionable causes (no secret leakage).

## 0.1.2 — 2026-09-24

### Changed

* Professional public README (Quick Start, complete example, full input/output tables, Why JEV, authentication, versioning).
* Stronger CONTRIBUTING, SECURITY, issue, and PR templates (explicit no-secrets guidance).
* Example workflows pin `@v0.1.1` and demonstrate output branching.

## 0.1.1 — 2026-09-24

- Shorten `action.yml` description to ≤125 characters for GitHub Marketplace.
- Marketplace listing copy and README badges prepared for publication.

## 0.1.0 — 2026-09-24

- Initial public Action: typed Jev rightsizing recommendations (`scale-down` | `keep` | `scale-up` | `review`).
- Normalized JSON/YAML metrics collector with shorthand CPU/memory helpers.
- Connectors: AWS CloudWatch, Azure Monitor, GCP Monitoring, Prometheus.
- Configurable Jev providers: `vercel-ai-gateway`, `typesafe-native`, `custom-compatible`.
- Deterministic low-confidence / incompleteness policy, dry-run GitHub effects, decision JSON + SARIF artifacts.
