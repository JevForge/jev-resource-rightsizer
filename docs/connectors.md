# Metrics connectors

All connectors normalize into the same `ResourceEvidence` model. Enable only what you need; combine with `metrics_path` / `metrics_json` when useful.

The Action keeps every collected resource visible. Use `include_resources` and
`exclude_resources` with comma/newline-separated globs to limit the resources
used by the decision without deleting their evidence from outputs.

All provider connectors accept a batch of resource ids and metric names. The
legacy singular inputs remain valid and are converted to a one-item batch.
Every metric carries its canonical `unit`; when a provider unit was converted,
the metric also includes `source_unit` and `normalization` (`identity` or
`ratio_to_percent`).

## Normalized JSON / YAML

Supports:

- full `resources[]` documents
- single-resource documents with `metrics[]`
- shorthand fields: `cpu`, `memory`, `network`, `disk`, `requests`, `cost`

## AWS CloudWatch

Inputs: `cloudwatch_enabled`, `cloudwatch_namespace`, `cloudwatch_metric_name` /
`cloudwatch_metric_names`, `cloudwatch_dimensions`, and
`cloudwatch_resource_id` / `cloudwatch_resource_ids`.

Credentials: standard AWS SDK chain (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / role).

Uses `GetMetricStatistics` with Average/Maximum/Minimum for each batch item.

## Azure Monitor

Inputs: `azure_enabled`, `azure_resource_id` / `azure_resource_ids`,
`azure_metric_names`, `azure_subscription_id`.

Credentials: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

Calls the `management.azure.com` metrics API and follows `nextLink` pages.

## GCP Monitoring

Inputs: `gcp_enabled`, `gcp_project_id`, `gcp_metric_type` /
`gcp_metric_types`, and `gcp_resource_id` / `gcp_resource_ids`.

Credentials: `GCP_ACCESS_TOKEN` (Bearer).

Calls `monitoring.googleapis.com` `timeSeries` with mean alignment and follows
`nextPageToken`. Utilization ratios in `0–1` are emitted as percent.

## Prometheus

Inputs: `prometheus_enabled`, `prometheus_url`, `prometheus_resource_id` /
`prometheus_resource_ids`, `prometheus_queries_path`.

Prometheus result labels `resource`, `resource_id`, or a query's optional
`resourceLabel` associate each returned series with a resource.

Optional: `PROMETHEUS_BEARER_TOKEN`.

Queries `/api/v1/query_range`. HTTPS required except `localhost` / `127.0.0.1`.

Example queries file: [`examples/prometheus-queries.yml`](../examples/prometheus-queries.yml).
