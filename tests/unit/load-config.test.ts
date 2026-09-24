import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMetricsReport } from '../../src/collectors/load.js';
import {
  loadRightsizerConfig,
  parseCloudWatchDimensions,
  pickBoolean,
  pickNumber,
  pickProvider,
  splitList,
} from '../../src/collectors/config.js';
import { ThresholdsSchema } from '../../src/schemas/metrics.js';

describe('config helpers', () => {
  it('parses dimensions and lists', () => {
    expect(parseCloudWatchDimensions('InstanceId=i-1,Name=web')).toEqual([
      { Name: 'InstanceId', Value: 'i-1' },
      { Name: 'Name', Value: 'web' },
    ]);
    expect(parseCloudWatchDimensions('[{"Name":"InstanceId","Value":"i-2"}]')).toEqual([
      { Name: 'InstanceId', Value: 'i-2' },
    ]);
    expect(splitList('a,b\nc')).toEqual(['a', 'b', 'c']);
    expect(pickBoolean('true', undefined, false)).toBe(true);
    expect(pickNumber('3', undefined, 1)).toBe(3);
    expect(pickProvider('', { jev_provider: 'typesafe-native' })).toBe('typesafe-native');
  });

  it('loads .jev/config.yml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rightsizer-'));
    mkdirSync(join(dir, '.jev'));
    writeFileSync(join(dir, '.jev', 'config.yml'), 'environment: staging\nmin_confidence: 0.8\n');
    const config = loadRightsizerConfig(dir);
    expect(config.environment).toBe('staging');
    expect(config.min_confidence).toBe(0.8);
  });
});

describe('loadMetricsReport', () => {
  it('loads metrics from a workspace file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rightsizer-metrics-'));
    writeFileSync(
      join(dir, 'metrics.json'),
      JSON.stringify({ resource_id: 'r1', cpu: 10, memory: 20 }),
    );
    const report = await loadMetricsReport({
      workspace: dir,
      environment: 'production',
      window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
      thresholds: ThresholdsSchema.parse({}),
      metricsPath: 'metrics.json',
    });
    expect(report.resources).toHaveLength(1);
    expect(report.heuristic_recommendation).toBe('scale-down');
  });

  it('loads inline metrics document', async () => {
    const report = await loadMetricsReport({
      workspace: process.cwd(),
      environment: 'development',
      window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
      thresholds: ThresholdsSchema.parse({}),
      metricsDocument: { resource_id: 'hot', cpu: 95, memory: 90 },
    });
    expect(report.heuristic_recommendation).toBe('scale-up');
  });

  it('loads prometheus via injected fetch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rightsizer-prom-'));
    writeFileSync(
      join(dir, 'queries.yml'),
      '- name: cpu\n  query: up\n  kind: cpu\n  unit: percent\n',
    );
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({ status: 'success', data: { result: [{ values: [[1, '9'], [2, '11']] }] } }),
        { status: 200 },
      );
    const report = await loadMetricsReport({
      workspace: dir,
      environment: 'staging',
      window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
      thresholds: ThresholdsSchema.parse({}),
      prometheus: {
        enabled: true,
        baseUrl: 'https://prometheus.example.com',
        resourceId: 'deploy/api',
        queriesPath: 'queries.yml',
        timeoutMs: 5000,
        fetchImpl,
      },
    });
    expect(report.sources).toContain('prometheus');
  });
});
