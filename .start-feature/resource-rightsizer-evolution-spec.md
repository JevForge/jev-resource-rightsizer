# Feature Spec: Resource RightSizer evolution

Status: Ready for implementation, subject to the documented thresholds assumption.

## Product behavior

The Action keeps one global Jev decision and exposes additional deterministic
evidence: normalized batches from all connectors, heuristic output, per-resource
recommendations, selected thresholds profile, trend reasons, and optional cost
impact estimates. Resources excluded by filters remain visible but do not affect
the decision.

## Release slices

1. `0.1.6`: include/exclude resource/service globs.
2. `0.1.7`: batch connector contract, multiple resources/metrics, pagination,
   explicit unit normalization, and connector error hardening.
3. `0.1.8`: `per_resource_recommendations` while retaining the global decision.
4. `0.1.9`: `balanced`, `conservative`, and `aggressive` threshold profiles plus
   environment-aware defaults.
5. `0.1.10`: slope/window-based trend reasons and optional rightsizing-to-cost
   impact bridge.
6. `0.1.11`: workflow-dispatch provider-mock smoke e2e with a golden fixture.

The existing `0.1.2` documentation, `0.1.3` error-prefix, `0.1.4` coverage,
and `0.1.5` heuristic-output releases are retained as historical slices.

## Acceptance

- Every connector can emit more than one metric for a resource and more than one
  resource where its provider response supports it.
- Provider-native units are converted explicitly to the canonical metric unit;
  GCP ratios become percentages for percentage metrics and byte metrics are not
  mistaken for percentages.
- HTTP 4xx/5xx and timeout errors have the stable Action prefix, an actionable
  cause, and no credential material.
- The decision contract remains backward compatible while adding optional fields.
- Per-resource recommendations are deterministic, independently testable, and do
  not perform mutations.
- Profiles and filters are configurable from Action inputs and `.jev/config.yml`.
- Trend reasons require enough ordered samples and do not turn an isolated spike
  into a trend.
- Cost impact is explicitly marked as an estimate and is absent when no cost
  signal exists.
- The smoke workflow exercises a local provider mock and verifies a golden output.

## Non-goals

- Cloud write permissions or automatic resizing.
- Persisting time series outside the supplied observation window.
- Exact provider billing reconciliation.
