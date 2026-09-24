import { describe, expect, it } from 'vitest';
import { collectCloudWatch } from '../../src/collectors/cloudwatch.js';
import { collectAzureMonitor } from '../../src/collectors/azure-monitor.js';
import { collectGcpMonitoring } from '../../src/collectors/gcp-monitoring.js';
import { collectPrometheus } from '../../src/collectors/prometheus.js';

describe('connectors', () => {
  it('collects CloudWatch datapoints', async () => {
    const result = await collectCloudWatch({
      environment: 'production',
      window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
      namespace: 'AWS/EC2',
      metricName: 'CPUUtilization',
      dimensions: [{ Name: 'InstanceId', Value: 'i-abc' }],
      resourceId: 'i-abc',
      service: 'aws',
      minSampleCount: 12,
      client: {
        async getMetricStatistics() {
          return {
            Datapoints: [
              { Average: 10, Maximum: 12, Minimum: 8, SampleCount: 5 },
              { Average: 14, Maximum: 18, Minimum: 9, SampleCount: 5 },
            ],
          };
        },
      },
    });
    expect(result.sources).toEqual(['cloudwatch']);
    expect(result.resources[0]?.metrics[0]?.stats.avg).toBeCloseTo(12);
  });

  it('collects Azure Monitor metrics', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          value: [
            {
              name: { value: 'Percentage CPU' },
              timeseries: [{ data: [{ average: 88 }, { average: 91 }] }],
            },
          ],
        }),
        { status: 200 },
      );
    const result = await collectAzureMonitor({
      environment: 'production',
      window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
      subscriptionId: 'sub',
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm1',
      metricNames: ['Percentage CPU'],
      accessToken: 'token',
      timeoutMs: 5000,
      fetchImpl,
      minSampleCount: 12,
    });
    expect(result.sources).toEqual(['azure-monitor']);
    expect(result.resources[0]?.metrics[0]?.kind).toBe('cpu');
  });

  it('collects GCP Monitoring points', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          timeSeries: [
            {
              metric: { type: 'compute.googleapis.com/instance/cpu/utilization' },
              points: [{ value: { doubleValue: 0.12 } }, { value: { doubleValue: 0.18 } }],
            },
          ],
        }),
        { status: 200 },
      );
    const result = await collectGcpMonitoring({
      environment: 'staging',
      window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
      projectId: 'proj',
      resourceId: '123',
      metricType: 'compute.googleapis.com/instance/cpu/utilization',
      accessToken: 'token',
      timeoutMs: 5000,
      fetchImpl,
      minSampleCount: 12,
    });
    expect(result.sources).toEqual(['gcp-monitoring']);
    expect(result.resources[0]?.metrics[0]?.stats.sample_count).toBe(2);
  });

  it('collects Prometheus query_range samples', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: 'success',
          data: { result: [{ values: [[1, '11'], [2, '13'], [3, '12']] }] },
        }),
        { status: 200 },
      );
    const result = await collectPrometheus({
      environment: 'production',
      window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
      baseUrl: 'https://prometheus.example.com',
      resourceId: 'deploy/api',
      queries: [{ name: 'cpu', query: 'avg(rate(cpu[5m]))', kind: 'cpu', unit: 'percent' }],
      timeoutMs: 5000,
      fetchImpl,
      minSampleCount: 12,
    });
    expect(result.sources).toEqual(['prometheus']);
    expect(result.resources[0]?.metrics[0]?.stats.avg).toBeCloseTo(12);
  });
});
