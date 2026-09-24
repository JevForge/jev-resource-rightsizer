# Changelog

## [Unreleased]

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
