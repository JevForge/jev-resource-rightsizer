import type { Recommendation } from '../schemas/enums.js';
import type { ResourceEvidence } from '../schemas/metrics.js';

export const MONTHLY_HOURS = 730;
export const DEFAULT_REDUCTION_FACTOR = 0.2;

export interface CostImpact {
  basis: 'monthly_cost_x_reduction_factor';
  estimated_monthly_impact: number;
  reduction_factor: number;
  is_estimate: true;
}

function hourlyCost(resource: ResourceEvidence): number | null {
  const metric = resource.metrics.find(item => item.kind === 'cost' && item.stats.avg != null);
  const value = resource.cost_hourly ?? metric?.stats.avg ?? null;
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
}

export function monthlyCost(resources: ResourceEvidence[]): number | null {
  let total = 0;
  let found = false;
  for (const resource of resources) {
    const monthly = resource.cost_monthly;
    if (monthly != null && Number.isFinite(monthly) && monthly >= 0) {
      total += monthly;
      found = true;
      continue;
    }
    const hourly = hourlyCost(resource);
    if (hourly != null) {
      total += hourly * MONTHLY_HOURS;
      found = true;
    }
  }
  return found ? total : null;
}

export function estimateCostImpact(
  recommendation: Recommendation,
  resources: ResourceEvidence[],
  reductionFactor = DEFAULT_REDUCTION_FACTOR,
): CostImpact | null {
  if (recommendation !== 'scale-down' && recommendation !== 'scale-up') return null;
  const monthly = monthlyCost(resources);
  if (monthly == null) return null;
  const direction = recommendation === 'scale-down' ? 1 : -1;
  return {
    basis: 'monthly_cost_x_reduction_factor',
    estimated_monthly_impact: Number((monthly * reductionFactor * direction).toFixed(2)),
    reduction_factor: reductionFactor,
    is_estimate: true,
  };
}
