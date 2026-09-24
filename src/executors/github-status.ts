import type { RightsizingDecision } from '../schemas/decision.js';
import type { PolicyOutcome } from '../decision/policy.js';

export const DECISION_LABEL_PREFIX = 'jev:rightsizing:recommendation:';
export const REVIEW_LABEL = 'jev:rightsizing:review';

export function recommendationLabel(recommendation: RightsizingDecision['recommendation']): string {
  return `${DECISION_LABEL_PREFIX}${recommendation}`;
}

export function desiredLabels(decision: RightsizingDecision): string[] {
  const labels = [recommendationLabel(decision.recommendation)];
  if (decision.recommendation === 'review') labels.push(REVIEW_LABEL);
  return labels;
}

export function isManagedLabel(name: string): boolean {
  return name.startsWith(DECISION_LABEL_PREFIX) || name === REVIEW_LABEL;
}

export interface LabelClient {
  listLabels(): Promise<string[]>;
  ensureLabel(name: string): Promise<void>;
  setLabels(next: string[]): Promise<void>;
}

export async function applyRightsizingLabels(
  enabled: boolean,
  dryRun: boolean,
  decision: RightsizingDecision,
  client: LabelClient | null,
): Promise<'applied' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  if (dryRun || !client) return 'dry-run';

  const current = await client.listLabels();
  const preserved = current.filter(name => !isManagedLabel(name));
  const wanted = desiredLabels(decision);
  const next = [...new Set([...preserved, ...wanted])];

  for (const name of wanted) {
    await client.ensureLabel(name);
  }
  await client.setLabels(next);
  return 'applied';
}

export function checkConclusion(outcome: PolicyOutcome): 'success' | 'neutral' | 'failure' {
  if (outcome.status === 'ok') return 'success';
  if (outcome.status === 'fail') return 'failure';
  return 'neutral';
}

export function buildCheckSummary(outcome: PolicyOutcome): string {
  const d = outcome.decision;
  return [
    '### JEV Resource RightSizer',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Recommendation | \`${d.recommendation}\` |`,
    `| Confidence | ${d.confidence.toFixed(3)} |`,
    `| Policy | \`${outcome.status}\` |`,
    `| Resources | \`${d.resource_count}\` |`,
    `| Partial | \`${d.partial_count}\` |`,
    `| Reason codes | ${d.reason_codes.map(code => `\`${code}\``).join(', ')} |`,
    '',
    d.explanation || '_No explanation._',
  ].join('\n');
}

export interface CheckRunClient {
  createCheckRun(input: {
    name: string;
    headSha: string;
    conclusion: 'success' | 'neutral' | 'failure';
    title: string;
    summary: string;
  }): Promise<void>;
}

export async function maybeCreateCheckRun(
  enabled: boolean,
  dryRun: boolean,
  headSha: string | null,
  outcome: PolicyOutcome,
  client: CheckRunClient | null,
): Promise<'created' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  if (!headSha) return 'skipped';
  if (dryRun || !client) return 'dry-run';

  await client.createCheckRun({
    name: 'JEV Resource RightSizer',
    headSha,
    conclusion: checkConclusion(outcome),
    title: `Rightsizing: ${outcome.decision.recommendation}`,
    summary: buildCheckSummary(outcome),
  });
  return 'created';
}
