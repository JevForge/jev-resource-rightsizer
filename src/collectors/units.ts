import type { MetricKind, MetricNormalization, MetricUnit } from '../schemas/enums.js';

export interface NormalizedValues {
  values: number[];
  unit: MetricUnit;
  source_unit?: MetricUnit;
  normalization?: MetricNormalization;
}

function isPercentageKind(kind: MetricKind): boolean {
  return kind === 'cpu' || kind === 'memory' || kind === 'disk';
}

export function inferMetricKind(name: string): MetricKind {
  const lower = name.toLowerCase();
  if (lower.includes('cpu')) return 'cpu';
  if (lower.includes('mem') || lower.includes('ram')) return 'memory';
  if (lower.includes('network') || lower.includes('bytes')) return 'network';
  if (lower.includes('disk')) return 'disk';
  if (lower.includes('request') || lower.includes('count')) return 'requests';
  if (lower.includes('cost') || lower.includes('price')) return 'cost';
  return 'custom';
}

export function normalizeMetricValues(
  values: number[],
  kind: MetricKind,
  nativeUnit?: string,
): NormalizedValues {
  const lower = (nativeUnit ?? '').toLowerCase();
  const ratio = lower === '1' || lower.includes('ratio') || lower.includes('dimensionless');
  const bytes = lower.includes('byte') || lower.includes('octet');
  if (ratio && isPercentageKind(kind)) {
    return {
      values: values.map(value => (Math.abs(value) <= 1 ? value * 100 : value)),
      unit: 'percent',
      source_unit: 'ratio',
      normalization: 'ratio_to_percent',
    };
  }
  if (bytes) {
    return { values, unit: 'bytes', source_unit: 'bytes', normalization: 'identity' };
  }
  if (isPercentageKind(kind)) {
    return { values, unit: 'percent', source_unit: 'percent', normalization: 'identity' };
  }
  if (kind === 'requests') {
    return { values, unit: 'requests_per_sec', source_unit: 'requests_per_sec', normalization: 'identity' };
  }
  return { values, unit: bytes ? 'bytes' : 'other', source_unit: bytes ? 'bytes' : 'other', normalization: 'identity' };
}
