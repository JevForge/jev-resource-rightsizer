import { describe, expect, it } from 'vitest';
import { parseNormalizedMetrics } from '../../src/collectors/normalized.js';
import { factualReasonCodes, heuristicRecommendation } from '../../src/collectors/aggregate.js';
import { ThresholdsSchema } from '../../src/schemas/metrics.js';
import { resource, report } from '../helpers.js';

describe('normalized metrics', () => {
  it('parses shorthand cpu/memory document', () => {
    const result = parseNormalizedMetrics(
      { resource_id: 'web-1', cpu: 12, memory: 25, requests: 0.2 },
      { environment: 'production', minSampleCount: 12 },
    );
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]?.metrics.map(m => m.kind).sort()).toEqual(['cpu', 'memory', 'requests']);
  });

  it('rejects empty documents', () => {
    expect(() =>
      parseNormalizedMetrics({}, { environment: 'production', minSampleCount: 12 }),
    ).toThrow();
  });
});

describe('heuristic recommendation', () => {
  const thresholds = ThresholdsSchema.parse({});

  it('recommends scale-down for low utilization', () => {
    const r = report([resource({ cpu: 8, memory: 18, requests: 0.1 })]);
    expect(r.heuristic_recommendation).toBe('scale-down');
    expect(r.factual_reasons).toContain('CPU_UNDERUTILIZED');
  });

  it('recommends scale-up for saturation', () => {
    const r = report([resource({ cpu: 90, memory: 85 })]);
    expect(r.heuristic_recommendation).toBe('scale-up');
    expect(r.factual_reasons).toContain('CPU_SATURATED');
  });

  it('recommends keep inside the band', () => {
    const r = report([resource({ cpu: 45, memory: 55 })]);
    expect(r.heuristic_recommendation).toBe('keep');
    expect(r.factual_reasons).toContain('WITHIN_BAND');
  });

  it('recommends review on spikes', () => {
    const r = report([resource({ cpu: 15, maxCpu: 90 })]);
    expect(r.heuristic_recommendation).toBe('review');
    expect(factualReasonCodes(r.resources, thresholds, 'production', ['normalized'])).toContain('SPIKE_DETECTED');
    expect(heuristicRecommendation(r.factual_reasons, thresholds, r.resources)).toBe('review');
  });
});
