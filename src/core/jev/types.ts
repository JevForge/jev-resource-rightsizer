import type { JevProviderId } from '../../schemas/enums.js';
import type { RightsizingDecision } from '../../schemas/decision.js';
import type { PerResourceRecommendation } from '../../schemas/decision.js';
import type { RightsizingReport } from '../../collectors/aggregate.js';

export interface RightsizingEvaluationState {
  environment: string;
  window: { start: string; end: string };
  thresholds: {
    scale_down_cpu_pct: number;
    scale_up_cpu_pct: number;
    scale_down_memory_pct: number;
    scale_up_memory_pct: number;
    min_sample_count: number;
    spike_ratio: number;
  };
  heuristic_recommendation: string;
  factual_reasons: string[];
  primary_resource_id: string | null;
  cpu_avg: number | null;
  memory_avg: number | null;
  request_avg: number | null;
  cost_hourly: number | null;
  partial_count: number;
  insufficient_count: number;
  sources: string[];
  warnings: string[];
  per_resource_recommendations: PerResourceRecommendation[];
  resources: Array<{
    resource_id: string;
    service: string;
    resource_kind: string;
    environment: string;
    current_size: string | null;
    cost_hourly: number | null;
    cost_monthly: number | null;
    metrics: Array<{
      kind: string;
      name: string;
      unit: string;
      source: string;
      avg: number | null;
      p95: number | null;
      p99: number | null;
      max: number | null;
      sample_count: number;
      partial: boolean;
      signal: string;
    }>;
  }>;
  note: string;
}

export interface JevRawAnswer {
  decision: string | null;
  confidence: number;
  incompleteProbability?: number;
  provisional: boolean;
  unavailableMessage?: string;
}

export interface JevProvider {
  readonly id: JevProviderId;
  evaluateRightsizing(state: RightsizingEvaluationState): Promise<JevRawAnswer>;
}

export interface JevProviderOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface NormalizedEvaluation {
  decision: RightsizingDecision;
  report: RightsizingReport;
}
