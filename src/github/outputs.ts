import type { RightsizingDecision } from '../schemas/decision.js';
import type { PolicyOutcome } from '../decision/policy.js';

export interface ActionOutputWriter {
  setOutput(name: string, value: string): void;
  setFailed(message: string): void;
  warning(message: string): void;
  info(message: string): void;
  summary(markdown: string): Promise<void> | void;
}

export function writeDecisionOutputs(writer: ActionOutputWriter, decision: RightsizingDecision): void {
  writer.setOutput('recommendation', decision.recommendation);
  writer.setOutput('confidence', String(decision.confidence));
  writer.setOutput('reason_codes', JSON.stringify(decision.reason_codes));
  writer.setOutput('summary', decision.summary);
  writer.setOutput('explanation', decision.explanation);
  writer.setOutput('provisional', String(decision.provisional));
  writer.setOutput('environment', decision.environment);
  writer.setOutput('resource_count', String(decision.resource_count));
  writer.setOutput('primary_resource_id', decision.primary_resource_id ?? '');
  writer.setOutput('supporting_metrics', JSON.stringify(decision.supporting_metrics));
  writer.setOutput('resources', JSON.stringify(decision.resources));
  writer.setOutput('sources', JSON.stringify(decision.sources));
  writer.setOutput('partial_count', String(decision.partial_count));
  writer.setOutput('insufficient_count', String(decision.insufficient_count));
  writer.setOutput('heuristic_recommendation', decision.heuristic_recommendation);
}

export async function applyOutcome(
  writer: ActionOutputWriter,
  outcome: PolicyOutcome,
  markdown: string,
): Promise<void> {
  writeDecisionOutputs(writer, outcome.decision);
  await writer.summary(markdown);
  if (outcome.status === 'fail') {
    writer.setFailed(outcome.message);
    return;
  }
  if (outcome.status === 'warn' || outcome.status === 'manual-review') {
    writer.warning(outcome.message);
    return;
  }
  if (outcome.status === 'no-op') writer.info(outcome.message);
}
