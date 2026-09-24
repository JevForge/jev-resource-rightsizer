import { summarizeValues } from '../utils/stats.js';
import { makeResource } from './resource.js';
import type { CollectResult } from './types.js';
import type { EnvironmentName } from '../schemas/enums.js';

export interface CloudWatchDatapoint {
  Timestamp?: Date | string;
  Average?: number;
  Maximum?: number;
  Minimum?: number;
  SampleCount?: number;
}

export interface CloudWatchClient {
  getMetricStatistics(input: {
    namespace: string;
    metricName: string;
    dimensions: Array<{ Name: string; Value: string }>;
    startTime: Date;
    endTime: Date;
    period: number;
    statistics: Array<'Average' | 'Maximum' | 'Minimum' | 'SampleCount' | 'Sum'>;
  }): Promise<{ Datapoints?: CloudWatchDatapoint[] }>;
}

export interface CloudWatchCollectOptions {
  environment: EnvironmentName;
  window: { start: string; end: string };
  namespace: string;
  metricName: string;
  dimensions: Array<{ Name: string; Value: string }>;
  resourceId: string;
  service: string;
  periodSeconds?: number;
  client: CloudWatchClient;
  minSampleCount: number;
}

function kindFromMetric(name: string): 'cpu' | 'memory' | 'network' | 'disk' | 'requests' | 'custom' {
  const lower = name.toLowerCase();
  if (lower.includes('cpu')) return 'cpu';
  if (lower.includes('mem')) return 'memory';
  if (lower.includes('network') || lower.includes('bytes')) return 'network';
  if (lower.includes('disk')) return 'disk';
  if (lower.includes('request') || lower.includes('count')) return 'requests';
  return 'custom';
}

export async function collectCloudWatch(options: CloudWatchCollectOptions): Promise<CollectResult> {
  const response = await options.client.getMetricStatistics({
    namespace: options.namespace,
    metricName: options.metricName,
    dimensions: options.dimensions,
    startTime: new Date(options.window.start),
    endTime: new Date(options.window.end),
    period: options.periodSeconds ?? 300,
statistics: ['Average', 'Maximum', 'Minimum', 'SampleCount'] as const,
    });
    const averages = (response.Datapoints ?? [])
    .map(point => point.Average)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const stats = summarizeValues(averages);
  const max = Math.max(
    ...((response.Datapoints ?? []).map(point => point.Maximum).filter((value): value is number => value != null)),
    Number.NEGATIVE_INFINITY,
  );
  const min = Math.min(
    ...((response.Datapoints ?? []).map(point => point.Minimum).filter((value): value is number => value != null)),
    Number.POSITIVE_INFINITY,
  );
  const kind = kindFromMetric(options.metricName);
  const resource = makeResource({
    resource_id: options.resourceId,
    service: options.service,
    resource_kind: 'compute',
    environment: options.environment,
    metrics: [
      {
        kind,
        name: options.metricName,
        unit: kind === 'cpu' || kind === 'memory' || kind === 'disk' ? 'percent' : 'other',
        source: 'cloudwatch',
        stats: {
          ...stats,
          max: Number.isFinite(max) ? max : stats.max,
          min: Number.isFinite(min) ? min : stats.min,
        },
        minSampleCount: options.minSampleCount,
        partial: stats.sample_count === 0,
      },
    ],
  });
  return {
    resources: [resource],
    warnings: stats.sample_count === 0 ? ['CloudWatch returned no datapoints for the observation window.'] : [],
    sources: ['cloudwatch'],
  };
}

export async function createDefaultCloudWatchClient(region?: string): Promise<CloudWatchClient> {
  const { CloudWatchClient, GetMetricStatisticsCommand } = await import('@aws-sdk/client-cloudwatch');
  const client = new CloudWatchClient({ region: region || process.env.AWS_REGION || 'us-east-1' });
  return {
    async getMetricStatistics(input) {
      const result = await client.send(
        new GetMetricStatisticsCommand({
          Namespace: input.namespace,
          MetricName: input.metricName,
          Dimensions: input.dimensions,
          StartTime: input.startTime,
          EndTime: input.endTime,
          Period: input.period,
          Statistics: input.statistics as Array<'Average' | 'Maximum' | 'Minimum' | 'SampleCount' | 'Sum'>,
        }),
      );
      return { Datapoints: result.Datapoints };
    },
  };
}
