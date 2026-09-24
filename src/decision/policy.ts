import type { ReasonCode, Recommendation } from '../schemas/enums.js';
import { RightsizingDecisionSchema, type RightsizingDecision } from '../schemas/decision.js';
import type { LowConfidencePolicy } from '../schemas/enums.js';
import type { RightsizingReport } from '../collectors/aggregate.js';
import { buildExplanation, buildSummary } from '../jev/normalize.js';

export type PolicyOutcome =
  | { status: 'ok'; decision: RightsizingDecision }
  | { status: 'warn'; decision: RightsizingDecision; message: string }
  | { status: 'manual-review'; decision: RightsizingDecision; message: string }
  | { status: 'no-op'; decision: RightsizingDecision; message: string }
  | { status: 'fail'; decision: RightsizingDecision; message: string };

export interface PolicyOptions {
  minConfidence: number;
  lowConfidencePolicy: LowConfidencePolicy;
  allowPartial: boolean;
  allowInsufficient: boolean;
  failOnReview: boolean;
  failOnScaleUp: boolean;
  failOnScaleDown: boolean;
}

function withRecommendation(
  decision: RightsizingDecision,
  next: Recommendation,
  report: RightsizingReport,
  reasons: Set<ReasonCode>,
): RightsizingDecision {
  const reason_codes = [...reasons].slice(0, 24);
  return {
    ...decision,
    recommendation: next,
    reason_codes,
    summary: buildSummary(next, report, decision.confidence),
    explanation: buildExplanation(next, report, decision.provisional),
  };
}

export function applyRightsizingPolicy(
  decision: RightsizingDecision,
  report: RightsizingReport,
  options: PolicyOptions,
): PolicyOutcome {
  const parsed = RightsizingDecisionSchema.parse(decision);
  const reasons = new Set<ReasonCode>(parsed.reason_codes);
  let current: RightsizingDecision = {
    ...parsed,
    resources: report.resources,
    supporting_metrics: report.resources.flatMap(resource => resource.metrics),
    per_resource_recommendations: report.per_resource_recommendations,
  };

  if (
    parsed.resources.length !== report.resources.length ||
    parsed.resources.some((resource, index) => resource.id !== report.resources[index]?.id)
  ) {
    reasons.add('RIGHTSIZING_VISIBILITY_ENFORCED');
  }
  if (
    parsed.per_resource_recommendations.length !== report.per_resource_recommendations.length ||
    parsed.per_resource_recommendations.some(
      (item, index) => item.resource_id !== report.per_resource_recommendations[index]?.resource_id,
    )
  ) {
    reasons.add('RIGHTSIZING_VISIBILITY_ENFORCED');
  }

  const unavailable = current.provisional || reasons.has('JEV_UNAVAILABLE');
  if (!unavailable) {
    if (!options.allowPartial && report.partial_count > 0 && current.recommendation !== 'review') {
      reasons.add('PARTIAL_METRICS');
      reasons.add('POLICY_MANUAL_REVIEW');
      current = withRecommendation(current, 'review', report, reasons);
    }
    if (
      !options.allowInsufficient &&
      report.insufficient_count > 0 &&
      (current.recommendation === 'scale-down' || current.recommendation === 'scale-up')
    ) {
      reasons.add('INSUFFICIENT_SAMPLES');
      reasons.add('POLICY_MANUAL_REVIEW');
      current = withRecommendation(current, 'review', report, reasons);
    }
    if (
      current.confidence < options.minConfidence &&
      (current.recommendation === 'scale-down' || current.recommendation === 'scale-up')
    ) {
      reasons.add('LOW_CONFIDENCE');
      reasons.add('POLICY_MANUAL_REVIEW');
      current = withRecommendation(current, 'review', report, reasons);
    }
    if (current.confidence < options.minConfidence) {
      reasons.add('LOW_CONFIDENCE');
      if (options.lowConfidencePolicy === 'request-review' && current.recommendation !== 'review') {
        reasons.add('POLICY_MANUAL_REVIEW');
        current = withRecommendation(current, 'review', report, reasons);
      }
    }
  }

  current = RightsizingDecisionSchema.parse({
    ...current,
    resources: report.resources,
    supporting_metrics: report.resources.flatMap(resource => resource.metrics),
    per_resource_recommendations: report.per_resource_recommendations,
    reason_codes: [...reasons].slice(0, 24),
  });

  const lowConfidence = current.confidence < options.minConfidence || current.provisional;
  if (lowConfidence && options.lowConfidencePolicy === 'fail') {
    return { status: 'fail', decision: current, message: current.summary };
  }
  if (current.recommendation === 'review' && options.failOnReview) {
    return { status: 'fail', decision: current, message: current.summary };
  }
  if (current.recommendation === 'scale-up' && options.failOnScaleUp) {
    return { status: 'fail', decision: current, message: current.summary };
  }
  if (current.recommendation === 'scale-down' && options.failOnScaleDown) {
    return { status: 'fail', decision: current, message: current.summary };
  }
  if (lowConfidence && options.lowConfidencePolicy === 'no-op') {
    return { status: 'no-op', decision: current, message: current.summary };
  }
  if (current.recommendation === 'review' || (lowConfidence && options.lowConfidencePolicy === 'request-review')) {
    return { status: 'manual-review', decision: current, message: current.summary };
  }
  if (lowConfidence && options.lowConfidencePolicy === 'warn') {
    return { status: 'warn', decision: current, message: current.summary };
  }
  return { status: 'ok', decision: current };
}
