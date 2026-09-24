import { RECOMMENDATIONS, REASON_CODES, type ReasonCode, type Recommendation } from '../../schemas/enums.js';
import { RightsizingDecisionSchema, type RightsizingDecision } from '../../schemas/decision.js';
import type { RightsizingReport } from '../../collectors/aggregate.js';
import { uniq } from '../../utils/fs.js';
import type { JevRawAnswer } from './types.js';

export function buildSummary(
  recommendation: Recommendation,
  report: RightsizingReport,
  confidence: number,
): string {
  const cpu = report.cpu_avg == null ? 'n/a' : `${report.cpu_avg.toFixed(1)}%`;
  const memory = report.memory_avg == null ? 'n/a' : `${report.memory_avg.toFixed(1)}%`;
  return `${recommendation}: ${report.resources.length} resource(s), cpu ${cpu}, memory ${memory}, confidence ${confidence.toFixed(3)}`.slice(
    0,
    500,
  );
}

export function buildExplanation(
  recommendation: Recommendation,
  report: RightsizingReport,
  provisional: boolean,
): string {
  const sentences = [
    `Jev recommendation is ${recommendation}.`,
    `Evaluated ${report.resources.length} resource(s) in ${report.environment} over ${report.window.start} → ${report.window.end}.`,
    `Heuristic baseline was ${report.heuristic_recommendation}.`,
    `${report.partial_count} partial metric series and ${report.insufficient_count} weak/insufficient series remain visible.`,
  ];
  if (report.warnings.length) sentences.push(report.warnings.join(' '));
  if (provisional) sentences.push('This decision is provisional because Jev did not return a usable typed answer.');
  sentences.push('This action never applies scale changes.');
  return sentences.join(' ').slice(0, 2_000);
}

function asRecommendation(value: string | null): Recommendation {
  if (!value || !(RECOMMENDATIONS as readonly string[]).includes(value)) {
    throw new Error('SCHEMA_REJECTED: decision is outside scale-down|keep|scale-up|review');
  }
  return value as Recommendation;
}

export function normalizeAnswer(answer: JevRawAnswer, report: RightsizingReport): RightsizingDecision {
  const reasons = new Set<ReasonCode>(
    uniq(report.factual_reasons).filter(code => (REASON_CODES as readonly string[]).includes(code)),
  );

  if (answer.unavailableMessage) {
    reasons.add('JEV_UNAVAILABLE');
    return RightsizingDecisionSchema.parse({
      recommendation: 'review',
      confidence: 0,
      reason_codes: [...reasons].slice(0, 24),
      environment: report.environment,
      window: report.window,
      resource_count: report.resources.length,
      primary_resource_id: report.primary_resource_id,
      supporting_metrics: report.resources.flatMap(resource => resource.metrics),
      resources: report.resources,
      thresholds: report.thresholds,
      threshold_profile: report.threshold_profile,
      summary: buildSummary('review', report, 0),
      explanation: `${buildExplanation('review', report, true)} ${answer.unavailableMessage}`.slice(0, 2_000),
      provisional: true,
      sources: report.sources,
      partial_count: report.partial_count,
      insufficient_count: report.insufficient_count,
      heuristic_recommendation: report.heuristic_recommendation,
      per_resource_recommendations: report.per_resource_recommendations,
    });
  }

  if (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
    throw new Error('SCHEMA_REJECTED: confidence must be between 0 and 1');
  }

  let recommendation = asRecommendation(answer.decision);
  if ((answer.incompleteProbability ?? 0) >= 0.55 && (recommendation === 'scale-down' || recommendation === 'scale-up')) {
    recommendation = 'review';
    reasons.add('PARTIAL_METRICS');
    reasons.add('POLICY_MANUAL_REVIEW');
  }

  const reason_codes = [...reasons].slice(0, 24);
  if (!reason_codes.length) reason_codes.push('WITHIN_BAND');

  return RightsizingDecisionSchema.parse({
    recommendation,
    confidence: answer.confidence,
    reason_codes,
    environment: report.environment,
    window: report.window,
    resource_count: report.resources.length,
    primary_resource_id: report.primary_resource_id,
    supporting_metrics: report.resources.flatMap(resource => resource.metrics),
    resources: report.resources,
    thresholds: report.thresholds,
    threshold_profile: report.threshold_profile,
    summary: buildSummary(recommendation, report, answer.confidence),
    explanation: buildExplanation(recommendation, report, false),
    provisional: answer.provisional,
    sources: report.sources,
    partial_count: report.partial_count,
    insufficient_count: report.insufficient_count,
    heuristic_recommendation: report.heuristic_recommendation,
    per_resource_recommendations: report.per_resource_recommendations,
  });
}
