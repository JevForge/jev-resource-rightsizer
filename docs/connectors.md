# Metrics connectors

All connectors normalize into the same `ResourceEvidence` model. Enable only what you need; combine with `metrics_path` / `metrics_json` when useful.

The Action keeps every collected resource visible. Use `include_resources` and
`exclude_resources` with comma/newline-separated globs to limit the resources
used by the decision without deleting their evidence from outputs.

## Normalized JSON / YAML

Supports:

- full `resources[]` documents
- single-resource documents with `metrics[]`
- shorthand fields: `cpu`, `memory`, `network`, `disk`, `requests`, `cost`

## AWS CloudWatch

Inputs: `cloudwatch_enabled`, `cloudwatch_namespace`, `cloudwatch_metric_name`, `cloudwatch_dimensions`, `cloudwatch_resource_id`.

Credentials: standard AWS SDK chain (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / role).

Uses `GetMetricStatistics` with Average/Maximum/Minimum.

## Azure Monitor

Inputs: `azure_enabled`, `azure_resource_id`, `azure_metric_names`, `azure_subscription_id`.

Credentials: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

Calls `management.azure.com` metrics API.

## GCP Monitoring

Inputs: `gcp_enabled`, `gcp_project_id`, `gcp_metric_type`, `gcp_resource_id`.

Credentials: `GCP_ACCESS_TOKEN` (Bearer).

Calls `monitoring.googleapis.com` `timeSeries` with mean alignment.

## Prometheus

Inputs: `prometheus_enabled`, `prometheus_url`, `prometheus_resource_id`, `prometheus_queries_path`.

Optional: `PROMETHEUS_BEARER_TOKEN`.

Queries `/api/v1/query_range`. HTTPS required except `localhost` / `127.0.0.1`.

Example queries file: [`examples/prometheus-queries.yml`](../examples/prometheus-queries.yml).
