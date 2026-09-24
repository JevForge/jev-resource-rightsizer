import { makeResource } from '../src/collectors/resource.js';
import { aggregateReport, type RightsizingReport } from '../src/collectors/aggregate.js';
import { ThresholdsSchema } from '../src/schemas/metrics.js';
import type { EnvironmentName, MetricKind } from '../src/schemas/enums.js';

export function resource(options: {
  resource_id?: string;
  cpu?: number | null;
  memory?: number | null;
  requests?: number | null;
  sample_count?: number;
  environment?: EnvironmentName;
  maxCpu?: number;
}): ReturnType<typeof makeResource> {
  const sample_count = options.sample_count ?? 48;
  const metrics: Array<{
    kind: MetricKind;
    name: string;
    unit: 'percent' | 'requests_per_sec';
    source: 'normalized';
    stats: {
      avg: number | null;
      max?: number | null;
      sample_count: number;
    };
  }> = [];
  if (options.cpu !== undefined) {
    metrics.push({
      kind: 'cpu',
      name: 'cpu',
      unit: 'percent',
      source: 'normalized',
      stats: { avg: options.cpu, max: options.maxCpu ?? options.cpu, sample_count },
    });
  }
  if (options.memory !== undefined) {
    metrics.push({
      kind: 'memory',
      name: 'memory',
      unit: 'percent',
      source: 'normalized',
      stats: { avg: options.memory, sample_count },
    });
  }
  if (options.requests !== undefined) {
    metrics.push({
      kind: 'requests',
      name: 'requests',
      unit: 'requests_per_sec',
      source: 'normalized',
      stats: { avg: options.requests, sample_count },
    });
  }
  if (!metrics.length) {
    metrics.push({
      kind: 'cpu',
      name: 'cpu',
      unit: 'percent',
      source: 'normalized',
      stats: { avg: 50, sample_count },
    });
  }
  return makeResource({
    resource_id: options.resource_id ?? 'svc-a',
    service: 'api',
    resource_kind: 'compute',
    environment: options.environment ?? 'production',
    metrics,
  });
}

export function report(
  resources: ReturnType<typeof resource>[],
  overrides: Partial<Parameters<typeof aggregateReport>[0]> = {},
): RightsizingReport {
  return aggregateReport({
    environment: 'production',
    window: { start: '2026-09-17T00:00:00.000Z', end: '2026-09-24T00:00:00.000Z' },
    thresholds: ThresholdsSchema.parse({}),
    collected: [{ resources, warnings: [], sources: ['normalized'] }],
    ...overrides,
  });
}

export const policyDefaults = {
  minConfidence: 0.75,
  lowConfidencePolicy: 'fail' as const,
  allowPartial: false,
  allowInsufficient: false,
  failOnReview: false,
  failOnScaleUp: false,
  failOnScaleDown: false,
};
