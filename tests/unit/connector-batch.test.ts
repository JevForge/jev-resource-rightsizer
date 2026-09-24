import { describe, expect, it } from 'vitest';
import { collectCloudWatch } from '../../src/collectors/cloudwatch.js';
import { collectAzureMonitor } from '../../src/collectors/azure-monitor.js';
import { collectGcpMonitoring } from '../../src/collectors/gcp-monitoring.js';
import { collectPrometheus } from '../../src/collectors/prometheus.js';

const window = { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' };

describe('connector batch contract', () => {
  it('collects multiple CloudWatch metrics for multiple resources', async () => {
    const calls: string[] = [];
    const result = await collectCloudWatch({
      environment: 'production',
      window,
      namespace: 'AWS/EC2',
      resources: [{ resourceId: 'i-1' }, { resourceId: 'i-2' }],
      metrics: [
        { metricName: 'CPUUtilization' },
        { metricName: 'NetworkIn', unit: 'bytes' },
      ],
      service: 'aws',
      minSampleCount: 12,
      client: {
        async getMetricStatistics(input) {
          calls.push(`${input.metricName}:${input.dimensions[0]?.Value}`);
          return { Datapoints: [{ Average: 0.25, Maximum: 0.5, Minimum: 0.1, SampleCount: 12 }] };
        },
      },
    });

    expect(calls).toHaveLength(4);
    expect(result.resources).toHaveLength(2);
    expect(result.resources.every(resource => resource.metrics)).toBe(true);
    expect(result.resources[0]?.metrics.map(metric => metric.unit)).toEqual(['percent', 'bytes']);
  });

  it('normalizes GCP utilization ratios and follows page tokens', async () => {
    let calls = 0;
    const result = await collectGcpMonitoring({
      environment: 'staging',
      window,
      projectId: 'proj',
      resourceIds: ['123'],
      metricTypes: ['compute.googleapis.com/instance/cpu/utilization'],
      accessToken: 'token',
      timeoutMs: 5000,
      fetchImpl: async () => {
        calls += 1;
        return new Response(
          JSON.stringify(
            calls === 1
              ? {
                  timeSeries: [{ resource: { labels: { instance_id: '123' } }, points: [{ value: { doubleValue: 0.1 } }] }],
                  nextPageToken: 'next',
                  unit: '1',
                }
              : {
                  timeSeries: [{ resource: { labels: { instance_id: '123' } }, points: [{ value: { doubleValue: 0.2 } }] }],
                  unit: '1',
                },
          ),
          { status: 200 },
        );
      },
      minSampleCount: 12,
    });

    expect(calls).toBe(2);
    expect(result.resources[0]?.metrics[0]?.unit).toBe('percent');
    expect(result.resources[0]?.metrics[0]?.source_unit).toBe('ratio');
    expect(result.resources[0]?.metrics[0]?.normalization).toBe('ratio_to_percent');
    expect(result.resources[0]?.metrics[0]?.stats.avg).toBeCloseTo(15);
  });

  it('groups Prometheus result series into resources', async () => {
    const result = await collectPrometheus({
      environment: 'production',
      window,
      baseUrl: 'https://prometheus.example.com',
      resourceIds: ['api', 'worker'],
      queries: [{ name: 'cpu', query: 'cpu_usage', kind: 'cpu', unit: 'percent' }],
      timeoutMs: 5000,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            status: 'success',
            data: {
              result: [
                { metric: { resource: 'api' }, values: [[1, '20'], [2, '30']] },
                { metric: { resource: 'worker' }, values: [[1, '80'], [2, '90']] },
              ],
            },
          }),
          { status: 200 },
        ),
      minSampleCount: 12,
    });

    expect(result.resources.map(resource => resource.resource_id)).toEqual(['api', 'worker']);
    expect(result.resources.map(resource => resource.metrics[0]?.stats.avg)).toEqual([25, 85]);
  });

  it('collects Azure resources across paginated responses', async () => {
    const result = await collectAzureMonitor({
      environment: 'production',
      window,
      subscriptionId: 'sub',
      resourceIds: ['r1', 'r2'],
      metricNames: ['Percentage CPU', 'Available Memory Bytes'],
      accessToken: 'token',
      timeoutMs: 5000,
      fetchImpl: async url => {
        const value = String(url);
        if (value.includes('r1') && !value.includes('page=2')) {
          return new Response(
            JSON.stringify({
              value: [{ name: { value: 'Percentage CPU' }, timeseries: [{ data: [{ average: 50 }] }] }],
              nextLink: `${value}&page=2`,
            }),
            { status: 200 },
          );
        }
        if (value.includes('r1')) {
          return new Response(
            JSON.stringify({
              value: [{ name: { value: 'Percentage CPU' }, timeseries: [{ data: [{ average: 60 }] }] }],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            value: [{ name: { value: 'Available Memory Bytes' }, unit: 'Bytes', timeseries: [{ data: [{ average: 1024 }] }] }],
          }),
          { status: 200 },
        );
      },
      minSampleCount: 12,
    });

    expect(result.resources).toHaveLength(2);
    expect(result.resources[0]?.metrics[0]?.stats.avg).toBe(55);
    expect(result.resources[1]?.metrics[0]?.unit).toBe('bytes');
  });
});
