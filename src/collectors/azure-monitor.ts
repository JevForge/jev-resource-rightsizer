import { summarizeValues } from '../utils/stats.js';
import { makeResource } from './resource.js';
import type { CollectResult, ConnectorFetch } from './types.js';
import type { EnvironmentName } from '../schemas/enums.js';
import { withRetry } from '../utils/retry.js';

export interface AzureMonitorCollectOptions {
  environment: EnvironmentName;
  window: { start: string; end: string };
  subscriptionId: string;
  resourceId: string;
  metricNames: string[];
  accessToken: string;
  service?: string;
  timeoutMs: number;
  fetchImpl?: ConnectorFetch;
  minSampleCount: number;
}

interface AzureMetricValue {
  average?: number;
  maximum?: number;
  minimum?: number;
  timeStamp?: string;
}

interface AzureMetricsResponse {
  value?: Array<{
    name?: { value?: string };
    timeseries?: Array<{ data?: AzureMetricValue[] }>;
  }>;
}

function kindFromMetric(name: string): 'cpu' | 'memory' | 'network' | 'disk' | 'requests' | 'custom' {
  const lower = name.toLowerCase();
  if (lower.includes('cpu') || lower.includes('percentage cpu')) return 'cpu';
  if (lower.includes('mem')) return 'memory';
  if (lower.includes('network')) return 'network';
  if (lower.includes('disk')) return 'disk';
  if (lower.includes('request')) return 'requests';
  return 'custom';
}

export async function collectAzureMonitor(options: AzureMonitorCollectOptions): Promise<CollectResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const metricNames = options.metricNames.join(',');
  const url =
    `https://management.azure.com${options.resourceId}/providers/microsoft.insights/metrics` +
    `?api-version=2023-10-01&timespan=${encodeURIComponent(`${options.window.start}/${options.window.end}`)}` +
    `&interval=PT5M&aggregation=Average,Maximum,Minimum&metricnames=${encodeURIComponent(metricNames)}`;

  const body = await withRetry(
    async () => {
      const response = await fetchImpl(url, {
        headers: { authorization: `Bearer ${options.accessToken}` },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Azure Monitor HTTP ${response.status}`);
      }
      return (await response.json()) as AzureMetricsResponse;
    },
    { label: 'Azure Monitor', attempts: 2 },
  );

  const metrics = (body.value ?? []).map(metric => {
    const points = (metric.timeseries ?? []).flatMap(series => series.data ?? []);
    const averages = points
      .map(point => point.average)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const stats = summarizeValues(averages);
    const name = metric.name?.value ?? 'metric';
    const kind = kindFromMetric(name);
    return {
      kind,
      name,
      unit: kind === 'cpu' || kind === 'memory' || kind === 'disk' ? ('percent' as const) : ('other' as const),
      source: 'azure-monitor' as const,
      stats,
      minSampleCount: options.minSampleCount,
      partial: stats.sample_count === 0,
    };
  });

  if (!metrics.length) {
    return {
      resources: [],
      warnings: ['Azure Monitor returned no metrics for the selected resource.'],
      sources: ['azure-monitor'],
    };
  }

  return {
    resources: [
      makeResource({
        resource_id: options.resourceId,
        service: options.service ?? 'azure',
        resource_kind: 'compute',
        environment: options.environment,
        metrics,
      }),
    ],
    warnings: metrics.every(metric => metric.partial)
      ? ['Azure Monitor returned empty timeseries for the observation window.']
      : [],
    sources: ['azure-monitor'],
  };
}

export async function acquireAzureToken(credentials: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: ConnectorFetch;
  timeoutMs: number;
}): Promise<string> {
  const fetchImpl = credentials.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    scope: 'https://management.azure.com/.default',
  });
  const response = await fetchImpl(
    `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(credentials.timeoutMs),
    },
  );
  if (!response.ok) {
    throw new Error(`Azure token HTTP ${response.status}`);
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Azure token response missing access_token');
  return json.access_token;
}
