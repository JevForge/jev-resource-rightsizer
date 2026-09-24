import { summarizeValues } from '../utils/stats.js';
import { makeResource } from './resource.js';
import type { CollectResult, ConnectorFetch } from './types.js';
import type { EnvironmentName } from '../schemas/enums.js';
import { withRetry } from '../utils/retry.js';

export interface GcpMonitoringCollectOptions {
  environment: EnvironmentName;
  window: { start: string; end: string };
  projectId: string;
  resourceId: string;
  metricType: string;
  accessToken: string;
  service?: string;
  timeoutMs: number;
  fetchImpl?: ConnectorFetch;
  minSampleCount: number;
}

interface GcpTimeSeriesResponse {
  timeSeries?: Array<{
    metric?: { type?: string };
    points?: Array<{
      value?: { doubleValue?: number; int64Value?: string };
      interval?: { endTime?: string };
    }>;
  }>;
}

function kindFromMetric(type: string): 'cpu' | 'memory' | 'network' | 'disk' | 'requests' | 'custom' {
  const lower = type.toLowerCase();
  if (lower.includes('cpu')) return 'cpu';
  if (lower.includes('memory') || lower.includes('ram')) return 'memory';
  if (lower.includes('network')) return 'network';
  if (lower.includes('disk')) return 'disk';
  if (lower.includes('request')) return 'requests';
  return 'custom';
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
  const filter = encodeURIComponent(
    `metric.type="${options.metricType}" AND resource.labels.instance_id="${options.resourceId}"`,
  );
  const url =
    `https://monitoring.googleapis.com/v3/projects/${options.projectId}/timeSeries` +
    `?filter=${filter}` +
    `&interval.startTime=${encodeURIComponent(options.window.start)}` +
    `&interval.endTime=${encodeURIComponent(options.window.end)}` +
    `&aggregation.alignmentPeriod=300s&aggregation.perSeriesAligner=ALIGN_MEAN`;

  const body = await withRetry(
    async () => {
      const response = await fetchImpl(url, {
        headers: { authorization: `Bearer ${options.accessToken}` },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`GCP Monitoring HTTP ${response.status}`);
      }
      return (await response.json()) as GcpTimeSeriesResponse;
    },
    { label: 'GCP Monitoring', attempts: 2 },
  );

  const values = (body.timeSeries ?? [])
    .flatMap(series => series.points ?? [])
    .map(pointValue)
    .filter((value): value is number => value != null);
  const stats = summarizeValues(values);
  const kind = kindFromMetric(options.metricType);

  return {
    resources: [
      makeResource({
        resource_id: options.resourceId,
        service: options.service ?? 'gcp',
        resource_kind: 'compute',
        environment: options.environment,
        metrics: [
          {
            kind,
            name: options.metricType,
            unit: kind === 'cpu' || kind === 'memory' || kind === 'disk' ? 'percent' : 'other',
            source: 'gcp-monitoring',
            stats,
            minSampleCount: options.minSampleCount,
            partial: stats.sample_count === 0,
          },
        ],
      }),
    ],
    warnings: stats.sample_count === 0 ? ['GCP Monitoring returned no points for the observation window.'] : [],
    sources: ['gcp-monitoring'],
  };
}
