import { summarizeTrend, summarizeValues } from '../utils/stats.js';
import { makeResource } from './resource.js';
import type { CollectResult, ConnectorFetch } from './types.js';
import type { EnvironmentName } from '../schemas/enums.js';
import { withRetry } from '../utils/retry.js';
import { actionError } from '../utils/errors.js';
import { normalizeMetricValues, inferMetricKind } from './units.js';
import { safeError } from '../utils/sanitize.js';

export interface AzureMonitorCollectOptions {
  environment: EnvironmentName;
  window: { start: string; end: string };
  subscriptionId: string;
  resourceId?: string;
  resourceIds?: string[];
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
  nextLink?: string;
  value?: Array<{
    name?: { value?: string };
    unit?: string;
    timeseries?: Array<{ data?: AzureMetricValue[] }>;
  }>;
}

export async function collectAzureMonitor(options: AzureMonitorCollectOptions): Promise<CollectResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resourceIds = options.resourceIds?.length ? options.resourceIds : options.resourceId ? [options.resourceId] : [];
  if (!resourceIds.length) throw new Error(actionError('Azure Monitor batch requires at least one resource.'));
  const metricNames = options.metricNames.length ? options.metricNames : ['Percentage CPU'];
  const warnings: string[] = [];
  const resources = [];

  for (const resourceId of resourceIds) {
    const metricsByName = new Map<string, { unit?: string; points: AzureMetricValue[] }>();
    let nextUrl: string | undefined =
      `https://management.azure.com${resourceId}/providers/microsoft.insights/metrics` +
      `?api-version=2023-10-01&timespan=${encodeURIComponent(`${options.window.start}/${options.window.end}`)}` +
      `&interval=PT5M&aggregation=Average,Maximum,Minimum&metricnames=${encodeURIComponent(metricNames.join(','))}`;
    do {
      const body = await withRetry(
        async () => {
          let response: Response;
          try {
            response = await fetchImpl(nextUrl!, {
              headers: { authorization: `Bearer ${options.accessToken}` },
              signal: AbortSignal.timeout(options.timeoutMs),
            });
          } catch (error) {
            throw new Error(actionError(`Azure Monitor request failed: ${safeError(error)}`));
          }
          if (!response.ok) {
            throw new Error(
              actionError(
                `Azure Monitor HTTP ${response.status}. Verify the resource id and that the identity has Monitoring Reader.`,
              ),
            );
          }
          return (await response.json()) as AzureMetricsResponse;
        },
        { label: 'Azure Monitor', attempts: 2 },
      );
      for (const metric of body.value ?? []) {
        const name = metric.name?.value ?? 'metric';
        const entry = metricsByName.get(name) ?? { unit: metric.unit, points: [] };
        entry.unit ??= metric.unit;
        entry.points.push(...(metric.timeseries ?? []).flatMap(series => series.data ?? []));
        metricsByName.set(name, entry);
      }
      nextUrl = body.nextLink;
    } while (nextUrl);

    const metrics = [...metricsByName.entries()].map(([name, entry]) => {
      const kind = inferMetricKind(name);
      const nativeUnit = entry.unit ?? (name.toLowerCase().includes('byte') ? 'bytes' : undefined);
      const averages = entry.points.map(point => point.average).filter((value): value is number => value != null && Number.isFinite(value));
      const normalized = normalizeMetricValues(averages, kind, nativeUnit);
      const stats = summarizeValues(normalized.values);
      const maximums = entry.points.map(point => point.maximum).filter((value): value is number => value != null && Number.isFinite(value));
      const minimums = entry.points.map(point => point.minimum).filter((value): value is number => value != null && Number.isFinite(value));
      const max = normalizeMetricValues(maximums, kind, nativeUnit).values;
      const min = normalizeMetricValues(minimums, kind, nativeUnit).values;
      if (!stats.sample_count) warnings.push(`Azure Monitor returned no samples for ${resourceId}/${name}.`);
      return {
        kind,
        name,
        unit: normalized.unit,
        source_unit: normalized.source_unit,
        normalization: normalized.normalization,
        trend: summarizeTrend(normalized.values),
        source: 'azure-monitor' as const,
        stats: {
          ...stats,
          max: max.length ? Math.max(...max) : stats.max,
          min: min.length ? Math.min(...min) : stats.min,
        },
        minSampleCount: options.minSampleCount,
        partial: stats.sample_count === 0,
      };
    });
    if (metrics.length) {
      resources.push(
        makeResource({
          resource_id: resourceId,
          service: options.service ?? 'azure',
          resource_kind: 'compute',
          environment: options.environment,
          metrics,
        }),
      );
    } else {
      warnings.push(`Azure Monitor returned no metrics for ${resourceId}.`);
    }
  }

  return { resources, warnings, sources: ['azure-monitor'] };
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
    throw new Error(
      actionError(`Azure token HTTP ${response.status}. Verify AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.`),
    );
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error(actionError('Azure token response missing access_token.'));
  }
  return json.access_token;
}
