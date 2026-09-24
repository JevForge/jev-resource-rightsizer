import { z } from 'zod';
import {
  ENVIRONMENTS,
  METRIC_KINDS,
  METRIC_SOURCES,
  METRIC_UNITS,
  RESOURCE_KINDS,
} from '../schemas/enums.js';
import { makeResource } from './resource.js';
import type { CollectResult } from './types.js';

const InputMetricSchema = z
  .object({
    kind: z.enum(METRIC_KINDS),
    name: z.string().min(1).max(128).optional(),
    unit: z.enum(METRIC_UNITS).optional(),
    source: z.enum(METRIC_SOURCES).optional(),
    avg: z.number().finite().nullable().optional(),
    p50: z.number().finite().nullable().optional(),
    p95: z.number().finite().nullable().optional(),
    p99: z.number().finite().nullable().optional(),
    min: z.number().finite().nullable().optional(),
    max: z.number().finite().nullable().optional(),
    sample_count: z.number().int().nonnegative().optional(),
    values: z.array(z.number().finite()).max(10_000).optional(),
    partial: z.boolean().optional(),
  })
  .strict();

const InputResourceSchema = z
  .object({
    resource_id: z.string().min(1).max(256),
    service: z.string().min(1).max(128).optional(),
    resource_kind: z.enum(RESOURCE_KINDS).optional(),
    environment: z.enum(ENVIRONMENTS).optional(),
    current_size: z.string().min(1).max(128).nullable().optional(),
    target_hint: z.string().min(1).max(128).nullable().optional(),
    cost_hourly: z.number().finite().nullable().optional(),
    cost_monthly: z.number().finite().nullable().optional(),
    metrics: z.array(InputMetricSchema).min(1).max(64),
  })
  .strict();

export const NormalizedMetricsDocumentSchema = z
  .object({
    resources: z.array(InputResourceSchema).min(1).max(500).optional(),
    // Shorthand: single resource at the top level
    resource_id: z.string().min(1).max(256).optional(),
    service: z.string().min(1).max(128).optional(),
    resource_kind: z.enum(RESOURCE_KINDS).optional(),
    environment: z.enum(ENVIRONMENTS).optional(),
    current_size: z.string().min(1).max(128).nullable().optional(),
    target_hint: z.string().min(1).max(128).nullable().optional(),
    cost_hourly: z.number().finite().nullable().optional(),
    cost_monthly: z.number().finite().nullable().optional(),
    metrics: z.array(InputMetricSchema).min(1).max(64).optional(),
    cpu: z.number().finite().optional(),
    memory: z.number().finite().optional(),
    network: z.number().finite().optional(),
    disk: z.number().finite().optional(),
    requests: z.number().finite().optional(),
    cost: z.number().finite().optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    if (!doc.resources?.length && !doc.metrics?.length && doc.cpu == null && doc.memory == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide resources[], metrics[], or shorthand cpu/memory fields',
      });
    }
  });

export type NormalizedMetricsDocument = z.infer<typeof NormalizedMetricsDocumentSchema>;

function defaultUnit(kind: (typeof METRIC_KINDS)[number]): (typeof METRIC_UNITS)[number] {
  switch (kind) {
    case 'cpu':
    case 'memory':
    case 'disk':
      return 'percent';
    case 'network':
      return 'bytes_per_sec';
    case 'requests':
      return 'requests_per_sec';
    case 'cost':
      return 'usd_per_hour';
    default:
      return 'other';
  }
}

function summarizeValues(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const at = (p: number) => {
    if (!sorted.length) return null;
    const rank = (p / 100) * (sorted.length - 1);
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    if (low === high) return sorted[low]!;
    return sorted[low]! * (1 - (rank - low)) + sorted[high]! * (rank - low);
  };
  return {
    avg: sorted.length ? sum / sorted.length : null,
    p50: at(50),
    p95: at(95),
    p99: at(99),
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    sample_count: sorted.length,
  };
}

function toMetricDraft(
  metric: z.infer<typeof InputMetricSchema>,
  minSampleCount: number,
): Parameters<typeof makeResource>[0]['metrics'][number] {
  const fromValues = metric.values?.length ? summarizeValues(metric.values) : null;
  return {
    kind: metric.kind,
    name: metric.name ?? metric.kind,
    unit: metric.unit ?? defaultUnit(metric.kind),
    source: metric.source ?? 'normalized',
    stats: {
      avg: metric.avg ?? fromValues?.avg ?? null,
      p50: metric.p50 ?? fromValues?.p50 ?? null,
      p95: metric.p95 ?? fromValues?.p95 ?? null,
      p99: metric.p99 ?? fromValues?.p99 ?? null,
      min: metric.min ?? fromValues?.min ?? null,
      max: metric.max ?? fromValues?.max ?? null,
      sample_count: metric.sample_count ?? fromValues?.sample_count ?? (metric.avg != null ? minSampleCount : 0),
    },
    partial: metric.partial,
    minSampleCount,
  };
}

function shorthandMetrics(doc: NormalizedMetricsDocument, minSampleCount: number) {
  const pairs: Array<[(typeof METRIC_KINDS)[number], number | undefined]> = [
    ['cpu', doc.cpu],
    ['memory', doc.memory],
    ['network', doc.network],
    ['disk', doc.disk],
    ['requests', doc.requests],
    ['cost', doc.cost],
  ];
  return pairs
    .filter((pair): pair is [(typeof METRIC_KINDS)[number], number] => pair[1] != null)
    .map(([kind, avg]) =>
      toMetricDraft(
        {
          kind,
          avg,
          sample_count: minSampleCount,
        },
        minSampleCount,
      ),
    );
}

export function parseNormalizedMetrics(
  document: unknown,
  options: {
    environment: (typeof ENVIRONMENTS)[number];
    minSampleCount: number;
  },
): CollectResult {
  const doc = NormalizedMetricsDocumentSchema.parse(document);
  const resourcesInput =
    doc.resources?.length
      ? doc.resources
      : [
          {
            resource_id: doc.resource_id ?? 'resource-1',
            service: doc.service,
            resource_kind: doc.resource_kind,
            environment: doc.environment,
            current_size: doc.current_size,
            target_hint: doc.target_hint,
            cost_hourly: doc.cost_hourly ?? doc.cost ?? null,
            cost_monthly: doc.cost_monthly ?? null,
            metrics: [
              ...(doc.metrics ?? []),
              ...shorthandMetrics(doc, options.minSampleCount).map(metric => ({
                kind: metric.kind,
                name: metric.name,
                unit: metric.unit,
                source: metric.source,
                avg: metric.stats.avg,
                p50: metric.stats.p50,
                p95: metric.stats.p95,
                p99: metric.stats.p99,
                min: metric.stats.min,
                max: metric.stats.max,
                sample_count: metric.stats.sample_count,
              })),
            ],
          },
        ];

  const resources = resourcesInput.map(resource => {
    const metrics =
      resource.metrics.length > 0
        ? resource.metrics.map(metric => toMetricDraft(metric, options.minSampleCount))
        : shorthandMetrics({ ...doc, ...resource }, options.minSampleCount);
    if (!metrics.length) {
      throw new Error(`Resource ${resource.resource_id} has no metrics`);
    }
    return makeResource({
      resource_id: resource.resource_id,
      service: resource.service ?? resource.resource_id,
      resource_kind: resource.resource_kind ?? 'compute',
      environment: resource.environment ?? options.environment,
      current_size: resource.current_size,
      target_hint: resource.target_hint,
      cost_hourly: resource.cost_hourly,
      cost_monthly: resource.cost_monthly,
      metrics,
    });
  });

  return {
    resources,
    warnings: [],
    sources: ['normalized'],
  };
}
