# Decision contract

## Valid recommendation enum

`scale-down` | `keep` | `scale-up` | `review`

## Jev participation

Jev receives a typed evaluation state and answers a `choice` question (`decision`) plus an `estimates_incomplete` boolean. The Action uses AI SDK `experimental_evaluate` for `vercel-ai-gateway` (model `typesafe-ai/jev`) and an HTTPS evaluate POST for native/custom providers. All providers normalize to the same `JevRawAnswer`.

## Deterministic executor limits

After schema validation, only allowlisted effects run:

- set Action outputs
- write job summary
- optional PR comment / labels / check run
- optional `core.setFailed`

No resize, restart, terraform apply, kubectl scale, or cloud write APIs are invoked.

## Valid decision example

```json
{
  "recommendation": "scale-down",
  "confidence": 0.91,
  "reason_codes": ["CPU_UNDERUTILIZED", "MEMORY_UNDERUTILIZED", "THRESHOLD_SCALE_DOWN", "PROD_ENVIRONMENT"],
  "environment": "production",
  "window": { "start": "2026-09-17T00:00:00.000Z", "end": "2026-09-24T00:00:00.000Z" },
  "resource_count": 1,
  "primary_resource_id": "api-prod-1",
  "supporting_metrics": [],
  "resources": [],
  "thresholds": {
    "scale_down_cpu_pct": 20,
    "scale_up_cpu_pct": 75,
    "scale_down_memory_pct": 30,
    "scale_up_memory_pct": 80,
    "min_sample_count": 12,
    "spike_ratio": 2.5
  },
  "summary": "scale-down: 1 resource(s), cpu 11.4%, memory 24.1%, confidence 0.910",
  "explanation": "Jev recommendation is scale-down. ... This action never applies scale changes.",
  "provisional": false,
  "sources": ["normalized"],
  "partial_count": 0,
  "insufficient_count": 0
}
```

(`resources` / `supporting_metrics` are populated at runtime; truncated here.)

## Invalid answers the schema rejects

| Payload | Rejection |
| --- | --- |
| `decision: "resize-now"` | outside enum |
| missing `answers.decision.choice` | `SCHEMA_REJECTED` |
| `confidence: 1.4` | must be 0..1 |
| dropping resource metrics in the final decision | visibility enforced / resources restored from report |
| free-text shell command as recommendation | not a valid choice |

When Jev is unavailable, the Action emits provisional `review` with `JEV_UNAVAILABLE` and applies `low_confidence_policy` — it does not invent a confident scale recommendation.
