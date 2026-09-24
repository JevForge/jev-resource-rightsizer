import type { EnvironmentName, MetricKind, ReasonCode, Recommendation } from '../schemas/enums.js';
import type { ObservationWindow, ResourceEvidence, Thresholds } from '../schemas/metrics.js';
import { uniq } from '../utils/fs.js';
import { actionError } from '../utils/errors.js';
import type { CollectResult } from './types.js';
import { activeResources, applyResourceFilters, type ResourceFilter } from './filters.js';
import type { PerResourceRecommendation } from '../schemas/decision.js';

export interface RightsizingReport {
  environment: EnvironmentName;
  window: ObservationWindow;
  thresholds: Thresholds;
  resources: ResourceEvidence[];
  sources: string[];
  warnings: string[];
  partial_count: number;
  insufficient_count: number;
  factual_reasons: ReasonCode[];
  heuristic_recommendation: Recommendation;
  per_resource_recommendations: PerResourceRecommendation[];
  primary_resource_id: string | null;
  cpu_avg: number | null;
  memory_avg: number | null;
  request_avg: number | null;
  cost_hourly: number | null;
}

function metricAvg(resource: ResourceEvidence, kind: MetricKind): number | null {
  const metric = resource.metrics.find(item => item.kind === kind && item.stats.avg != null);
  return metric?.stats.avg ?? null;
}

function metricMax(resource: ResourceEvidence, kind: MetricKind): number | null {
  const metric = resource.metrics.find(item => item.kind === kind);
  return metric?.stats.max ?? metric?.stats.p99 ?? metric?.stats.p95 ?? metric?.stats.avg ?? null;
}

export function factualReasonCodes(
  resources: ResourceEvidence[],
  thresholds: Thresholds,
  environment: EnvironmentName,
  sources: string[],
): ReasonCode[] {
  const codes: ReasonCode[] = [];
  let scaleDownVotes = 0;
  let scaleUpVotes = 0;
  let mixed = false;

  for (const resource of resources) {
    if (resource.excluded) {
      codes.push('RESOURCE_FILTERED');
      continue;
    }
    const cpu = metricAvg(resource, 'cpu');
    const memory = metricAvg(resource, 'memory');
    const requests = metricAvg(resource, 'requests');
    const disk = metricAvg(resource, 'disk');
    const cost = resource.cost_hourly ?? metricAvg(resource, 'cost');
    const cpuMax = metricMax(resource, 'cpu');

    if (resource.metrics.some(metric => metric.partial || metric.signal === 'insufficient')) {
      codes.push('PARTIAL_METRICS');
      codes.push('INSUFFICIENT_SAMPLES');
    }
    if (cpu != null && cpu <= thresholds.scale_down_cpu_pct) {
      codes.push('CPU_UNDERUTILIZED');
      codes.push('THRESHOLD_SCALE_DOWN');
      scaleDownVotes += 1;
    }
    if (cpu != null && cpu >= thresholds.scale_up_cpu_pct) {
      codes.push('CPU_SATURATED');
      codes.push('THRESHOLD_SCALE_UP');
      scaleUpVotes += 1;
    }
    if (memory != null && memory <= thresholds.scale_down_memory_pct) {
      codes.push('MEMORY_UNDERUTILIZED');
      scaleDownVotes += 1;
    }
    if (memory != null && memory >= thresholds.scale_up_memory_pct) {
      codes.push('MEMORY_PRESSURE');
      scaleUpVotes += 1;
    }
    if (requests != null && requests < 1) {
      codes.push('REQUEST_LOAD_LOW');
      scaleDownVotes += 1;
    }
    if (requests != null && requests > 100) {
      codes.push('REQUEST_LOAD_HIGH');
      scaleUpVotes += 1;
    }
    if (disk != null && disk >= 85) codes.push('DISK_PRESSURE');
    if (cost != null && cost > 5 && (cpu ?? 100) < thresholds.scale_down_cpu_pct) {
      codes.push('COST_HIGH_RELATIVE');
    }
    if (cost != null && cost > 0 && (cpu ?? 0) >= thresholds.scale_up_cpu_pct) {
      codes.push('COST_EFFICIENT');
    }
    if (
      cpu != null &&
      cpuMax != null &&
      cpu > 0 &&
      cpuMax / cpu >= thresholds.spike_ratio
    ) {
      codes.push('SPIKE_DETECTED');
      mixed = true;
    }
    if (
      cpu != null &&
      cpu > thresholds.scale_down_cpu_pct &&
      cpu < thresholds.scale_up_cpu_pct &&
      (memory == null ||
        (memory > thresholds.scale_down_memory_pct && memory < thresholds.scale_up_memory_pct))
    ) {
      codes.push('WITHIN_BAND');
      codes.push('HEADROOM_AMPLE');
    }
    if (cpu != null && cpu >= thresholds.scale_up_cpu_pct * 0.9) {
      codes.push('HEADROOM_TIGHT');
    }
  }

  if (scaleDownVotes > 0 && scaleUpVotes > 0) {
    codes.push('MIXED_SIGNALS');
    mixed = true;
  }
  codes.push(environment === 'production' ? 'PROD_ENVIRONMENT' : 'NON_PROD_ENVIRONMENT');
  if (sources.length > 1) codes.push('MULTI_SOURCE');
  if (mixed) codes.push('MIXED_SIGNALS');
  return uniq(codes);
}

export function heuristicRecommendation(
  reasons: ReasonCode[],
  thresholds: Thresholds,
  resources: ResourceEvidence[],
): Recommendation {
  if (reasons.includes('MIXED_SIGNALS') || reasons.includes('SPIKE_DETECTED')) return 'review';
  if (
    reasons.includes('INSUFFICIENT_SAMPLES') ||
    reasons.includes('PARTIAL_METRICS') ||
    resources.every(resource =>
      resource.metrics.every(metric => metric.signal === 'insufficient' || metric.signal === 'weak'),
    )
  ) {
    return 'review';
  }
  const scaleUp =
    reasons.includes('CPU_SATURATED') ||
    reasons.includes('MEMORY_PRESSURE') ||
    reasons.includes('REQUEST_LOAD_HIGH') ||
    reasons.includes('THRESHOLD_SCALE_UP');
  const scaleDown =
    reasons.includes('CPU_UNDERUTILIZED') ||
    reasons.includes('MEMORY_UNDERUTILIZED') ||
    reasons.includes('REQUEST_LOAD_LOW') ||
    reasons.includes('THRESHOLD_SCALE_DOWN');
  if (scaleUp && !scaleDown) return 'scale-up';
  if (scaleDown && !scaleUp) return 'scale-down';
  if (scaleUp && scaleDown) return 'review';
  void thresholds;
  return 'keep';
}

export function perResourceRecommendations(
  resources: ResourceEvidence[],
  thresholds: Thresholds,
  environment: EnvironmentName,
  sources: string[],
): PerResourceRecommendation[] {
  return resources.map(resource => {
    if (resource.excluded) {
      return {
        resource_id: resource.resource_id,
        recommendation: 'review',
        heuristic_recommendation: 'review',
        reason_codes: ['RESOURCE_FILTERED'],
        excluded: true,
      };
    }
    const reason_codes = factualReasonCodes([resource], thresholds, environment, sources);
    const recommendation = heuristicRecommendation(reason_codes, thresholds, [resource]);
    return {
      resource_id: resource.resource_id,
      recommendation,
      heuristic_recommendation: recommendation,
      reason_codes,
      excluded: false,
    };
  });
}

export function aggregateReport(input: {
  environment: EnvironmentName;
  window: ObservationWindow;
  thresholds: Thresholds;
  collected: CollectResult[];
  filters?: ResourceFilter;
}): RightsizingReport {
  const filtered = applyResourceFilters(
    input.collected.flatMap(item => item.resources),
    input.filters ?? {},
  );
  const decisionResources = activeResources(filtered);
  if (!filtered.length) {
    throw new Error(
      actionError('No resource metrics were collected. Provide metrics_json, metrics_path, or enable a connector.'),
    );
  }
  if (!decisionResources.length) {
    throw new Error(
      actionError('All collected resources were excluded by include_resources / exclude_resources filters.'),
    );
  }
  const sources = uniq(input.collected.flatMap(item => item.sources));
  const warnings = input.collected.flatMap(item => item.warnings);
  if (filtered.some(resource => resource.excluded)) {
    warnings.push('One or more resources were excluded from the rightsizing decision by filters.');
  }
  const partial_count = decisionResources.reduce(
    (sum, resource) => sum + resource.metrics.filter(metric => metric.partial).length,
    0,
  );
  const insufficient_count = decisionResources.reduce(
    (sum, resource) =>
      sum + resource.metrics.filter(metric => metric.signal === 'insufficient' || metric.signal === 'weak').length,
    0,
  );
  const factual_reasons = factualReasonCodes(filtered, input.thresholds, input.environment, sources);
  const heuristic_recommendation = heuristicRecommendation(
    factual_reasons,
    input.thresholds,
    decisionResources,
  );
  const per_resource_recommendations = perResourceRecommendations(
    filtered,
    input.thresholds,
    input.environment,
    sources,
  );
  const primary = decisionResources[0]!;
  return {
    environment: input.environment,
    window: input.window,
    thresholds: input.thresholds,
    resources: filtered,
    sources,
    warnings,
    partial_count,
    insufficient_count,
    factual_reasons,
    heuristic_recommendation,
    per_resource_recommendations,
    primary_resource_id: primary.resource_id,
    cpu_avg: metricAvg(primary, 'cpu'),
    memory_avg: metricAvg(primary, 'memory'),
    request_avg: metricAvg(primary, 'requests'),
    cost_hourly: primary.cost_hourly ?? metricAvg(primary, 'cost'),
  };
}
