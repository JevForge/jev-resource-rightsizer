import { summarizeValues } from '../utils/stats.js';
import { makeResource } from './resource.js';
import type { CollectResult, ConnectorFetch } from './types.js';
import type { EnvironmentName, MetricKind, MetricUnit } from '../schemas/enums.js';
import { withRetry } from '../utils/retry.js';

export interface PrometheusQuery {
  name: string;
  query: string;
  kind: MetricKind;
  unit?: MetricUnit;
}

export interface PrometheusCollectOptions {
  environment: EnvironmentName;
  window: { start: string; end: string };
  baseUrl: string;
  resourceId: string;
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
      values?: Array<[number, string]>;
    }>;
  };
}

function parseValues(response: PrometheusQueryRangeResponse): number[] {
  const values: number[] = [];
  for (const series of response.data?.result ?? []) {
    for (const point of series.values ?? []) {
      const raw = point[1];
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) values.push(parsed);
    }
  }
  return values;
}

export async function collectPrometheus(options: PrometheusCollectOptions): Promise<CollectResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, '');
  if (!base.startsWith('https://') && !base.startsWith('http://localhost') && !base.startsWith('http://127.0.0.1')) {
    throw new Error('prometheus_url must be HTTPS (or localhost for local development)');
  }

  const metrics = [];
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
        const response = await fetchImpl(url.toString(), {
          headers,
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        if (!response.ok) throw new Error(`Prometheus HTTP ${response.status}`);
        return (await response.json()) as PrometheusQueryRangeResponse;
      },
      { label: `Prometheus ${query.name}`, attempts: 2 },
    );

    const stats = summarizeValues(parseValues(body));
    if (stats.sample_count === 0) {
      warnings.push(`Prometheus query "${query.name}" returned no samples.`);
    }
    metrics.push({
      kind: query.kind,
      name: query.name,
      unit:
        query.unit ??
        (query.kind === 'cpu' || query.kind === 'memory' || query.kind === 'disk'
          ? ('percent' as const)
          : query.kind === 'requests'
            ? ('requests_per_sec' as const)
            : ('other' as const)),
      source: 'prometheus' as const,
      stats,
      minSampleCount: options.minSampleCount,
      partial: stats.sample_count === 0,
    });
  }

  return {
    resources: [
      makeResource({
        resource_id: options.resourceId,
        service: options.service ?? 'prometheus',
        resource_kind: 'container',
        environment: options.environment,
        metrics,
      }),
    ],
    warnings,
    sources: ['prometheus'],
  };
}
