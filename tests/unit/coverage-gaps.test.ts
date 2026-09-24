import { describe, expect, it, vi } from 'vitest';
import {
  applyRightsizingLabels,
  buildCheckSummary,
  checkConclusion,
  maybeCreateCheckRun,
} from '../../src/executors/github-status.js';
import { maybePostComment, COMMENT_MARKER } from '../../src/executors/effects.js';
import { normalizeAnswer } from '../../src/core/jev/normalize.js';
import { report, resource } from '../helpers.js';
import { loadMetricsReport } from '../../src/collectors/load.js';
import { ThresholdsSchema } from '../../src/schemas/metrics.js';
import { collectAzureMonitor } from '../../src/collectors/azure-monitor.js';
import { collectPrometheus } from '../../src/collectors/prometheus.js';
import { collectGcpMonitoring } from '../../src/collectors/gcp-monitoring.js';

describe('github-status executor', () => {
  it('applies managed labels and preserves others', async () => {
    const decision = normalizeAnswer(
      { decision: 'keep', confidence: 0.9, provisional: false },
      report([resource({ cpu: 45 })]),
    );
    const setLabels = vi.fn(async () => undefined);
    const ensureLabel = vi.fn(async () => undefined);
    const status = await applyRightsizingLabels(true, false, decision, {
      listLabels: async () => ['bug', 'jev:rightsizing:recommendation:review'],
      ensureLabel,
      setLabels,
    });
    expect(status).toBe('applied');
    expect(ensureLabel).toHaveBeenCalled();
    expect(setLabels).toHaveBeenCalledWith(
      expect.arrayContaining(['bug', 'jev:rightsizing:recommendation:keep']),
    );
  });

  it('creates check runs and maps conclusions', async () => {
    const decision = normalizeAnswer(
      { decision: 'scale-up', confidence: 0.95, provisional: false },
      report([resource({ cpu: 90, memory: 85 })]),
    );
    const outcome = { status: 'ok' as const, decision };
    expect(checkConclusion(outcome)).toBe('success');
    expect(checkConclusion({ status: 'fail', decision, message: 'x' })).toBe('failure');
    expect(checkConclusion({ status: 'warn', decision, message: 'x' })).toBe('neutral');
    expect(buildCheckSummary(outcome)).toContain('scale-up');

    const createCheckRun = vi.fn(async () => undefined);
    const created = await maybeCreateCheckRun(true, false, 'abc123', outcome, { createCheckRun });
    expect(created).toBe('created');
    expect(createCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ headSha: 'abc123', conclusion: 'success' }),
    );
    expect(await maybeCreateCheckRun(false, false, 'abc', outcome, { createCheckRun })).toBe('skipped');
    expect(await maybeCreateCheckRun(true, true, 'abc', outcome, { createCheckRun })).toBe('dry-run');
    expect(await maybeCreateCheckRun(true, false, null, outcome, { createCheckRun })).toBe('skipped');
  });

  it('posts and updates PR comments', async () => {
    const decision = normalizeAnswer(
      { decision: 'keep', confidence: 0.9, provisional: false },
      report([resource({ cpu: 40 })]),
    );
    const createComment = vi.fn(async () => undefined);
    const updateComment = vi.fn(async () => undefined);
    const posted = await maybePostComment(true, false, decision, {
      listComments: async () => [],
      createComment,
      updateComment,
    });
    expect(posted).toBe('posted');
    expect(createComment).toHaveBeenCalled();

    const updated = await maybePostComment(true, false, decision, {
      listComments: async () => [{ id: 7, body: `${COMMENT_MARKER}\nold` }],
      createComment,
      updateComment,
    });
    expect(updated).toBe('updated');
    expect(updateComment).toHaveBeenCalledWith(7, expect.stringContaining(COMMENT_MARKER));
  });
});

describe('loadMetricsReport validation', () => {
  const base = {
    workspace: process.cwd(),
    environment: 'production' as const,
    window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
    thresholds: ThresholdsSchema.parse({}),
  };

  it('rejects incomplete cloudwatch config', async () => {
    await expect(
      loadMetricsReport({
        ...base,
        cloudwatch: { enabled: true, namespace: 'AWS/EC2' },
      }),
    ).rejects.toThrow(/cloudwatch_enabled requires/);
  });

  it('rejects azure without resource id', async () => {
    await expect(
      loadMetricsReport({
        ...base,
        azure: { enabled: true, timeoutMs: 1000 },
      }),
    ).rejects.toThrow(/azure_resource_id/);
  });

  it('rejects gcp without token', async () => {
    await expect(
      loadMetricsReport({
        ...base,
        gcp: {
          enabled: true,
          projectId: 'p',
          metricType: 'compute.googleapis.com/instance/cpu/utilization',
          resourceId: '1',
          timeoutMs: 1000,
        },
      }),
    ).rejects.toThrow(/GCP_ACCESS_TOKEN/);
  });

  it('loads cloudwatch via injected client', async () => {
    const report = await loadMetricsReport({
      ...base,
      cloudwatch: {
        enabled: true,
        namespace: 'AWS/EC2',
        metricName: 'CPUUtilization',
        dimensionsRaw: 'InstanceId=i-1',
        resourceId: 'i-1',
        client: {
          async getMetricStatistics() {
            return { Datapoints: [{ Average: 22, Maximum: 30, Minimum: 10, SampleCount: 4 }] };
          },
        },
      },
    });
    expect(report.sources).toContain('cloudwatch');
  });
});

describe('connector HTTP failures', () => {
  it('surfaces Azure Monitor HTTP errors', async () => {
    const fetchImpl: typeof fetch = async () => new Response('denied', { status: 403 });
    await expect(
      collectAzureMonitor({
        environment: 'production',
        window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
        subscriptionId: 'sub',
        resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm1',
        metricNames: ['Percentage CPU'],
        accessToken: 'token',
        timeoutMs: 2000,
        fetchImpl,
        minSampleCount: 12,
      }),
    ).rejects.toThrow(/Azure Monitor HTTP 403/);
  });

  it('surfaces Prometheus HTTP errors', async () => {
    const fetchImpl: typeof fetch = async () => new Response('nope', { status: 500 });
    await expect(
      collectPrometheus({
        environment: 'production',
        window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
        baseUrl: 'https://prometheus.example.com',
        resourceId: 'api',
        queries: [{ name: 'cpu', query: 'up', kind: 'cpu' }],
        timeoutMs: 2000,
        fetchImpl,
        minSampleCount: 12,
      }),
    ).rejects.toThrow(/Prometheus HTTP 500/);
  });

  it('surfaces GCP Monitoring HTTP errors', async () => {
    const fetchImpl: typeof fetch = async () => new Response('nope', { status: 401 });
    await expect(
      collectGcpMonitoring({
        environment: 'production',
        window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
        projectId: 'p',
        resourceId: '1',
        metricType: 'compute.googleapis.com/instance/cpu/utilization',
        accessToken: 'token',
        timeoutMs: 2000,
        fetchImpl,
        minSampleCount: 12,
      }),
    ).rejects.toThrow(/GCP Monitoring HTTP 401/);
  });
});
