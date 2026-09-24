import { summarizeTrend, summarizeValues } from '../utils/stats.js';
import { makeResource } from './resource.js';
import type { CollectResult, ConnectorFetch } from './types.js';
import type { EnvironmentName } from '../schemas/enums.js';
import { withRetry } from '../utils/retry.js';
import { actionError } from '../utils/errors.js';
import { normalizeMetricValues, inferMetricKind } from './units.js';
import { safeError } from '../utils/sanitize.js';

export interface GcpMonitoringCollectOptions {
  environment: EnvironmentName;
  window: { start: string; end: string };
  projectId: string;
  resourceId?: string;
  metricType?: string;
  resourceIds?: string[];
  metricTypes?: string[];
  accessToken: string;
  service?: string;
  timeoutMs: number;
  fetchImpl?: ConnectorFetch;
  minSampleCount: number;
}

interface GcpTimeSeriesResponse {
  unit?: string;
  nextPageToken?: string;
  timeSeries?: Array<{
    metric?: { type?: string };
    resource?: { labels?: Record<string, string> };
    unit?: string;
    points?: Array<{
      value?: { doubleValue?: number; int64Value?: string };
      interval?: { endTime?: string };
    }>;
  }>;
}

function pointValue(point: { value?: { doubleValue?: number; int64Value?: string } }): number | null {
  if (point.value?.doubleValue != null) return point.value.doubleValue;
  if (point.value?.int64Value != null) {
    const parsed = Number(point.value.int64Value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function collectGcpMonitoring(options: GcpMonitoringCollectOptions): Promise<CollectResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resourceIds = options.resourceIds?.length ? options.resourceIds : options.resourceId ? [options.resourceId] : [];
  const metricTypes = options.metricTypes?.length ? options.metricTypes : options.metricType ? [options.metricType] : [];
  if (!resourceIds.length || !metricTypes.length) {
    throw new Error(actionError('GCP Monitoring batch requires at least one metric type and one resource.'));
  }

  const valuesByResource = new Map<string, Map<string, { values: number[]; unit?: string }>>();
  const warnings: string[] = [];
  for (const resourceId of resourceIds) {
    for (const metricType of metricTypes) {
      const values: number[] = [];
      let nativeUnit: string | undefined;
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          filter: `metric.type="${metricType}" AND resource.labels.instance_id="${resourceId}"`,
          'interval.startTime': options.window.start,
          'interval.endTime': options.window.end,
          'aggregation.alignmentPeriod': '300s',
          'aggregation.perSeriesAligner': 'ALIGN_MEAN',
          view: 'FULL',
        });
        if (pageToken) params.set('pageToken', pageToken);
        const url = `https://monitoring.googleapis.com/v3/projects/${options.projectId}/timeSeries?${params.toString()}`;
        const body = await withRetry(
          async () => {
            let response: Response;
            try {
              response = await fetchImpl(url, {
                headers: { authorization: `Bearer ${options.accessToken}` },
                signal: AbortSignal.timeout(options.timeoutMs),
              });
            } catch (error) {
              throw new Error(actionError(`GCP Monitoring request failed: ${safeError(error)}`));
            }
            if (!response.ok) {
              throw new Error(
                actionError(
                  `GCP Monitoring HTTP ${response.status}. Verify GCP_ACCESS_TOKEN scopes and project/metric/resource ids.`,
                ),
              );
            }
            return (await response.json()) as GcpTimeSeriesResponse;
          },
          { label: 'GCP Monitoring', attempts: 2 },
        );
        nativeUnit = body.unit ?? body.timeSeries?.find(series => series.unit)?.unit ?? nativeUnit;
        values.push(
          ...(body.timeSeries ?? [])
            .flatMap(series => series.points ?? [])
            .map(pointValue)
            .filter((value): value is number => value != null),
        );
        pageToken = body.nextPageToken;
      } while (pageToken);
      const perMetric = valuesByResource.get(resourceId) ?? new Map<string, { values: number[]; unit?: string }>();
      perMetric.set(metricType, { values, unit: nativeUnit });
      valuesByResource.set(resourceId, perMetric);
    }
  }

  const resources = resourceIds.map(resourceId => {
    const metricDrafts = metricTypes.map(metricType => {
      const entry = valuesByResource.get(resourceId)?.get(metricType) ?? { values: [] };
      const kind = inferMetricKind(metricType);
      const lowerMetricType = metricType.toLowerCase();
      const inferredUnit = lowerMetricType.includes('byte')
        ? 'bytes'
        : lowerMetricType.includes('utilization') && kind !== 'custom'
          ? '1'
          : undefined;
      const normalized = normalizeMetricValues(entry.values, kind, entry.unit ?? inferredUnit);
      const stats = summarizeValues(normalized.values);
      if (!stats.sample_count) warnings.push(`GCP Monitoring returned no points for ${resourceId}/${metricType}.`);
      return {
        kind,
        name: metricType,
        unit: normalized.unit,
        source_unit: normalized.source_unit,
        normalization: normalized.normalization,
        trend: summarizeTrend(normalized.values),
        source: 'gcp-monitoring' as const,
        stats,
        minSampleCount: options.minSampleCount,
        partial: stats.sample_count === 0,
      };
    });
    return makeResource({
      resource_id: resourceId,
      service: options.service ?? 'gcp',
      resource_kind: 'compute',
      environment: options.environment,
      metrics: metricDrafts,
    });
  });
  return { resources, warnings, sources: ['gcp-monitoring'] };
}
