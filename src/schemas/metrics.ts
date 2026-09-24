import { z } from 'zod';
import {
  ENVIRONMENTS,
  METRIC_KINDS,
  METRIC_NORMALIZATIONS,
  METRIC_SOURCES,
  METRIC_UNITS,
  RESOURCE_KINDS,
  SIGNAL_STRENGTHS,
} from './enums.js';

const IsoLike = z.string().min(10).max(64);

export const ObservationWindowSchema = z
  .object({
    start: IsoLike,
    end: IsoLike,
  })
  .strict();

export type ObservationWindow = z.infer<typeof ObservationWindowSchema>;

export const MetricStatsSchema = z
  .object({
    avg: z.number().finite().nullable(),
    p50: z.number().finite().nullable().optional(),
    p95: z.number().finite().nullable().optional(),
    p99: z.number().finite().nullable().optional(),
    min: z.number().finite().nullable().optional(),
    max: z.number().finite().nullable().optional(),
    sample_count: z.number().int().nonnegative(),
  })
  .strict();

export type MetricStats = z.infer<typeof MetricStatsSchema>;

export const MetricSeriesSchema = z
  .object({
    id: z.string().min(1).max(256),
    kind: z.enum(METRIC_KINDS),
    name: z.string().min(1).max(128),
    unit: z.enum(METRIC_UNITS),
    source_unit: z.enum(METRIC_UNITS).optional(),
    normalization: z.enum(METRIC_NORMALIZATIONS).optional(),
    source: z.enum(METRIC_SOURCES),
    stats: MetricStatsSchema,
    partial: z.boolean(),
    signal: z.enum(SIGNAL_STRENGTHS),
  })
  .strict();

export type MetricSeries = z.infer<typeof MetricSeriesSchema>;

export const ResourceEvidenceSchema = z
  .object({
    id: z.string().min(1).max(256),
    resource_id: z.string().min(1).max(256),
    service: z.string().min(1).max(128),
    resource_kind: z.enum(RESOURCE_KINDS),
    environment: z.enum(ENVIRONMENTS),
    current_size: z.string().min(1).max(128).nullable().optional(),
    target_hint: z.string().min(1).max(128).nullable().optional(),
    metrics: z.array(MetricSeriesSchema).min(1).max(64),
    cost_hourly: z.number().finite().nullable().optional(),
    cost_monthly: z.number().finite().nullable().optional(),
    excluded: z.boolean().optional(),
  })
  .strict();

export type ResourceEvidence = z.infer<typeof ResourceEvidenceSchema>;

export const ThresholdsSchema = z
  .object({
    scale_down_cpu_pct: z.number().min(0).max(100).default(20),
    scale_up_cpu_pct: z.number().min(0).max(100).default(75),
    scale_down_memory_pct: z.number().min(0).max(100).default(30),
    scale_up_memory_pct: z.number().min(0).max(100).default(80),
    min_sample_count: z.number().int().positive().default(12),
    spike_ratio: z.number().positive().default(2.5),
  })
  .strict();

export type Thresholds = z.infer<typeof ThresholdsSchema>;
