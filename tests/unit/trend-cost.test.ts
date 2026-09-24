import { describe, expect, it } from 'vitest';
import { parseNormalizedMetrics } from '../../src/collectors/normalized.js';
import { factualReasonCodes, heuristicRecommendation } from '../../src/collectors/aggregate.js';
import { estimateCostImpact } from '../../src/collectors/cost.js';
import { ThresholdsSchema } from '../../src/schemas/metrics.js';
import { makeResource } from '../../src/collectors/resource.js';

describe('trend and cost bridge', () => {
  it('records a rising slope and emits TREND_RISING', () => {
    const collected = parseNormalizedMetrics(
      { resource_id: 'api', metrics: [{ kind: 'cpu', values: [10, 20, 30, 40] }] },
      { environment: 'production', minSampleCount: 2 },
    );
    const metric = collected.resources[0]!.metrics[0]!;
    const reasons = factualReasonCodes(collected.resources, ThresholdsSchema.parse({}), 'production', ['normalized']);

    expect(metric.trend?.direction).toBe('rising');
    expect(metric.trend?.window_sample_count).toBe(4);
    expect(reasons).toContain('TREND_RISING');
  });

  it('does not turn an isolated spike into a trend', () => {
    const collected = parseNormalizedMetrics(
      { resource_id: 'api', metrics: [{ kind: 'cpu', values: [10, 100, 10] }] },
      { environment: 'production', minSampleCount: 2 },
    );
    const metric = collected.resources[0]!.metrics[0]!;
    const reasons = factualReasonCodes(collected.resources, ThresholdsSchema.parse({}), 'production', ['normalized']);

    expect(metric.trend?.direction).toBe('flat');
    expect(reasons).toContain('SPIKE_DETECTED');
    expect(heuristicRecommendation(reasons, ThresholdsSchema.parse({}), collected.resources)).toBe('review');
  });

  it('returns an explicitly estimated monthly impact from cost signals', () => {
    const resource = makeResource({
      resource_id: 'api',
      service: 'api',
      resource_kind: 'compute',
      environment: 'production',
      cost_hourly: 2,
      metrics: [{ kind: 'cpu', name: 'cpu', unit: 'percent', source: 'normalized', stats: { avg: 10, sample_count: 24 } }],
    });

    expect(estimateCostImpact('scale-down', [resource])).toEqual({
      basis: 'monthly_cost_x_reduction_factor',
      estimated_monthly_impact: 292,
      reduction_factor: 0.2,
      is_estimate: true,
    });
  });
});
