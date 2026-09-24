import { createHash } from 'node:crypto';
import type {
  EnvironmentName,
  MetricKind,
  MetricNormalization,
  MetricSource,
  MetricUnit,
  ResourceKind,
  SignalStrength,
} from '../schemas/enums.js';
import type { MetricSeries, ResourceEvidence } from '../schemas/metrics.js';

export interface MetricDraft {
  kind: MetricKind;
  name: string;
  unit: MetricUnit;
  source_unit?: MetricUnit;
  normalization?: MetricNormalization;
  source: MetricSource;
  stats: {
    avg: number | null;
    p50?: number | null;
    p95?: number | null;
    p99?: number | null;
    min?: number | null;
    max?: number | null;
    sample_count: number;
  };
  partial?: boolean;
  signal?: SignalStrength;
  minSampleCount?: number;
}

export interface ResourceDraft {
  resource_id: string;
  service: string;
  resource_kind: ResourceKind;
  environment: EnvironmentName;
  current_size?: string | null;
  target_hint?: string | null;
  metrics: MetricDraft[];
  cost_hourly?: number | null;
  cost_monthly?: number | null;
}

function signalFor(sampleCount: number, minSampleCount: number, partial: boolean): SignalStrength {
  if (partial || sampleCount === 0) return 'insufficient';
  if (sampleCount < minSampleCount) return 'weak';
  if (sampleCount < minSampleCount * 2) return 'moderate';
  return 'strong';
}

export function makeMetric(draft: MetricDraft): MetricSeries {
  const partial = draft.partial ?? (draft.stats.avg == null || draft.stats.sample_count === 0);
  const minSampleCount = draft.minSampleCount ?? 12;
  const id = createHash('sha256')
    .update(`${draft.source}:${draft.kind}:${draft.name}`)
    .digest('hex')
    .slice(0, 16);
  return {
    id,
    kind: draft.kind,
    name: draft.name,
    unit: draft.unit,
    ...(draft.source_unit ? { source_unit: draft.source_unit } : {}),
    ...(draft.normalization ? { normalization: draft.normalization } : {}),
    source: draft.source,
    stats: {
      avg: draft.stats.avg,
      p50: draft.stats.p50 ?? null,
      p95: draft.stats.p95 ?? null,
      p99: draft.stats.p99 ?? null,
      min: draft.stats.min ?? null,
      max: draft.stats.max ?? null,
      sample_count: draft.stats.sample_count,
    },
    partial,
    signal: draft.signal ?? signalFor(draft.stats.sample_count, minSampleCount, partial),
  };
}

export function makeResource(draft: ResourceDraft): ResourceEvidence {
  const id = createHash('sha256')
    .update(`${draft.environment}:${draft.service}:${draft.resource_id}`)
    .digest('hex')
    .slice(0, 16);
  return {
    id,
    resource_id: draft.resource_id,
    service: draft.service,
    resource_kind: draft.resource_kind,
    environment: draft.environment,
    current_size: draft.current_size ?? null,
    target_hint: draft.target_hint ?? null,
    metrics: draft.metrics.map(makeMetric),
    cost_hourly: draft.cost_hourly ?? null,
    cost_monthly: draft.cost_monthly ?? null,
  };
}
