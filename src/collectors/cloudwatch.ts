import { summarizeTrend, summarizeValues } from '../utils/stats.js';
import { makeResource } from './resource.js';
import type { CollectResult } from './types.js';
import { normalizeMetricValues, inferMetricKind } from './units.js';
import type { EnvironmentName, MetricKind, MetricUnit, ResourceKind } from '../schemas/enums.js';
import { actionError } from '../utils/errors.js';
import { safeError } from '../utils/sanitize.js';

export interface CloudWatchDatapoint {
  Timestamp?: Date | string;
  Average?: number;
  Maximum?: number;
  Minimum?: number;
  SampleCount?: number;
  Unit?: string;
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
  metricName?: string;
  dimensions?: Array<{ Name: string; Value: string }>;
  resourceId?: string;
  metrics?: Array<{ metricName: string; kind?: MetricKind; unit?: MetricUnit; name?: string }>;
  resources?: Array<{
    resourceId: string;
    dimensions?: Array<{ Name: string; Value: string }>;
    service?: string;
    resourceKind?: ResourceKind;
  }>;
  service: string;
  periodSeconds?: number;
  client: CloudWatchClient;
  minSampleCount: number;
}

export async function collectCloudWatch(options: CloudWatchCollectOptions): Promise<CollectResult> {
  const metrics = options.metrics?.length
    ? options.metrics
    : options.metricName
      ? [{ metricName: options.metricName }]
      : [];
  const resources = options.resources?.length
    ? options.resources
    : options.resourceId
      ? [{ resourceId: options.resourceId, dimensions: options.dimensions, service: options.service }]
      : [];
  if (!metrics.length || !resources.length) {
    throw new Error(actionError('CloudWatch batch requires at least one metric and one resource.'));
  }

  const warnings: string[] = [];
  const output = [];
  for (const target of resources) {
    const metricDrafts = [];
    for (const query of metrics) {
      let response: { Datapoints?: CloudWatchDatapoint[] };
      try {
        response = await options.client.getMetricStatistics({
          namespace: options.namespace,
          metricName: query.metricName,
          dimensions: target.dimensions ?? options.dimensions ?? [],
          startTime: new Date(options.window.start),
          endTime: new Date(options.window.end),
          period: options.periodSeconds ?? 300,
          statistics: ['Average', 'Maximum', 'Minimum', 'SampleCount'] as const,
        });
      } catch (error) {
        throw new Error(actionError(`CloudWatch request failed for ${query.metricName}: ${safeError(error)}`));
      }
      const kind = query.kind ?? inferMetricKind(query.metricName);
      const points = response.Datapoints ?? [];
      const nativeUnit = query.unit ?? points.find(point => point.Unit)?.Unit;
      const averages = points.map(point => point.Average).filter((value): value is number => value != null && Number.isFinite(value));
      const normalized = query.unit
        ? { values: averages, unit: query.unit, source_unit: query.unit, normalization: 'identity' as const }
        : normalizeMetricValues(averages, kind, nativeUnit);
      const stats = summarizeValues(normalized.values);
      const maximums = points.map(point => point.Maximum).filter((value): value is number => value != null && Number.isFinite(value));
      const minimums = points.map(point => point.Minimum).filter((value): value is number => value != null && Number.isFinite(value));
      const normalizedMaximum = query.unit ? maximums : normalizeMetricValues(maximums, kind, nativeUnit).values;
      const normalizedMinimum = query.unit ? minimums : normalizeMetricValues(minimums, kind, nativeUnit).values;
      const max = Math.max(...normalizedMaximum, Number.NEGATIVE_INFINITY);
      const min = Math.min(...normalizedMinimum, Number.POSITIVE_INFINITY);
      if (!stats.sample_count) warnings.push(`CloudWatch returned no datapoints for ${target.resourceId}/${query.metricName}.`);
      metricDrafts.push({
        kind,
        name: query.name ?? query.metricName,
        unit: normalized.unit,
        source_unit: normalized.source_unit,
        normalization: normalized.normalization,
        trend: summarizeTrend(normalized.values),
        source: 'cloudwatch' as const,
        stats: { ...stats, max: Number.isFinite(max) ? max : stats.max, min: Number.isFinite(min) ? min : stats.min },
        minSampleCount: options.minSampleCount,
        partial: stats.sample_count === 0,
      });
    }
    output.push(
      makeResource({
        resource_id: target.resourceId,
        service: target.service ?? options.service ?? 'aws',
        resource_kind: target.resourceKind ?? 'compute',
        environment: options.environment,
        metrics: metricDrafts,
      }),
    );
  }
  return { resources: output, warnings, sources: ['cloudwatch'] };
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
