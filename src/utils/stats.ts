export function defaultWindow(now = new Date()): { start: string; end: string } {
  const end = now.toISOString();
  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start: startDate.toISOString(), end };
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low]!;
  const weight = rank - low;
  return sorted[low]! * (1 - weight) + sorted[high]! * weight;
}

export function summarizeValues(values: number[]): {
  avg: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  min: number | null;
  max: number | null;
  sample_count: number;
} {
  const finite = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!finite.length) {
    return { avg: null, p50: null, p95: null, p99: null, min: null, max: null, sample_count: 0 };
  }
  const sum = finite.reduce((acc, value) => acc + value, 0);
  return {
    avg: sum / finite.length,
    p50: percentile(finite, 50),
    p95: percentile(finite, 95),
    p99: percentile(finite, 99),
    min: finite[0]!,
    max: finite[finite.length - 1]!,
    sample_count: finite.length,
  };
}

export function summarizeTrend(values: number[]) {
  if (values.length < 2) return { slope: 0, window_sample_count: values.length, direction: 'flat' as const };
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const slope = (last - first) / (values.length - 1);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const threshold = Math.max(Math.abs(average) * 0.05, 0.01);
  return {
    slope,
    window_sample_count: values.length,
    direction: slope > threshold ? ('rising' as const) : slope < -threshold ? ('falling' as const) : ('flat' as const),
  };
}
