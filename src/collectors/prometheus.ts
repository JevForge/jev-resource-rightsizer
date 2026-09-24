import { summarizeValues } from '../utils/stats.js';
import { makeResource } from './resource.js';
import type { CollectResult, ConnectorFetch } from './types.js';
import type { EnvironmentName, MetricKind, MetricUnit } from '../schemas/enums.js';
import { withRetry } from '../utils/retry.js';
import { actionError } from '../utils/errors.js';
import { normalizeMetricValues } from './units.js';
import { safeError } from '../utils/sanitize.js';

export interface PrometheusQuery {
  name: string;
  query: string;
  kind: MetricKind;
  unit?: MetricUnit;
  resourceLabel?: string;
}

export interface PrometheusCollectOptions {
  environment: EnvironmentName;
  window: { start: string; end: string };
  baseUrl: string;
  resourceId?: string;
  resourceIds?: string[];
  service?: string;
  queries: PrometheusQuery[];
  bearerToken?: string;
  timeoutMs: number;
  fetchImpl?: ConnectorFetch;
  minSampleCount: number;
}

interface PrometheusQueryRangeResponse {
  status?: string;
  data?: {
    result?: Array<{
      metric?: Record<string, string>;
      values?: Array<[number, string]>;
    }>;
  };
}

function parseValuesByResource(
  response: PrometheusQueryRangeResponse,
  fallbackResourceId: string,
  resourceLabel: string,
): Map<string, number[]> {
  const valuesByResource = new Map<string, number[]>();
  for (const series of response.data?.result ?? []) {
    const resourceId = series.metric?.[resourceLabel] ?? series.metric?.resource_id ?? series.metric?.resource ?? fallbackResourceId;
    const values = valuesByResource.get(resourceId) ?? [];
    for (const point of series.values ?? []) {
      const parsed = Number(point[1]);
      if (Number.isFinite(parsed)) values.push(parsed);
    }
    valuesByResource.set(resourceId, values);
  }
  return valuesByResource;
}

export async function collectPrometheus(options: PrometheusCollectOptions): Promise<CollectResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, '');
  if (!base.startsWith('https://') && !base.startsWith('http://localhost') && !base.startsWith('http://127.0.0.1')) {
    throw new Error(
      actionError('prometheus_url must be HTTPS (or localhost / 127.0.0.1 for local development)'),
    );
  }

  const resourceIds = options.resourceIds?.length ? options.resourceIds : options.resourceId ? [options.resourceId] : [];
  if (!resourceIds.length) throw new Error(actionError('Prometheus batch requires at least one resource.'));
  const metricsByResource = new Map<string, Array<{
    kind: MetricKind;
    name: string;
    unit: MetricUnit;
    source_unit?: MetricUnit;
    normalization?: 'identity' | 'ratio_to_percent';
    source: 'prometheus';
    stats: ReturnType<typeof summarizeValues>;
    minSampleCount: number;
    partial: boolean;
  }>>();
  for (const resourceId of resourceIds) metricsByResource.set(resourceId, []);
  const warnings: string[] = [];

  for (const query of options.queries) {
    const url = new URL(`${base}/api/v1/query_range`);
    url.searchParams.set('query', query.query);
    url.searchParams.set('start', String(Math.floor(new Date(options.window.start).getTime() / 1000)));
    url.searchParams.set('end', String(Math.floor(new Date(options.window.end).getTime() / 1000)));
    url.searchParams.set('step', '300');

    const body = await withRetry(
      async () => {
        const headers: Record<string, string> = {};
        if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`;
        let response: Response;
        try {
          response = await fetchImpl(url.toString(), {
            headers,
            signal: AbortSignal.timeout(options.timeoutMs),
          });
        } catch (error) {
          throw new Error(actionError(`Prometheus request failed for ${query.name}: ${safeError(error)}`));
        }
        if (!response.ok) {
          throw new Error(
            actionError(`Prometheus HTTP ${response.status}. Verify prometheus_url, query, and bearer token.`),
          );
        }
        return (await response.json()) as PrometheusQueryRangeResponse;
      },
      { label: `Prometheus ${query.name}`, attempts: 2 },
    );

    const valuesByResource = parseValuesByResource(body, resourceIds[0]!, query.resourceLabel ?? 'resource');
    for (const resourceId of resourceIds) {
      const normalized = normalizeMetricValues(valuesByResource.get(resourceId) ?? [], query.kind, query.unit);
      const stats = summarizeValues(normalized.values);
      if (stats.sample_count === 0) warnings.push(`Prometheus query "${query.name}" returned no samples for ${resourceId}.`);
      metricsByResource.get(resourceId)?.push({
        kind: query.kind,
        name: query.name,
        unit: normalized.unit,
        source_unit: normalized.source_unit,
        normalization: normalized.normalization,
        source: 'prometheus',
        stats,
        minSampleCount: options.minSampleCount,
        partial: stats.sample_count === 0,
      });
    }
  }

  return {
    resources: resourceIds.map(resourceId => makeResource({
      resource_id: resourceId,
      service: options.service ?? 'prometheus',
      resource_kind: 'container',
      environment: options.environment,
      metrics: metricsByResource.get(resourceId) ?? [],
    })),
    warnings,
    sources: ['prometheus'],
  };
}
