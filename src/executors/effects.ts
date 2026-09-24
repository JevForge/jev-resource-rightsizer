import type { RightsizingDecision } from '../schemas/decision.js';
import type { PolicyOutcome } from '../decision/policy.js';
import { escapeCell } from '../utils/sanitize.js';

export const COMMENT_MARKER = '<!-- jev-resource-rightsizer -->';

export const ALLOWED_EFFECTS = [
  'set-outputs',
  'write-summary',
  'pull-request-comment',
  'check-run',
  'apply-labels',
  'fail-workflow',
] as const;
export type AllowedEffect = (typeof ALLOWED_EFFECTS)[number];

export function effectsFor(
  outcome: PolicyOutcome,
  options: { comment: boolean; checkRun: boolean; labels: boolean },
): AllowedEffect[] {
  const effects: AllowedEffect[] = ['set-outputs', 'write-summary'];
  if (options.comment) effects.push('pull-request-comment');
  if (options.checkRun) effects.push('check-run');
  if (options.labels) effects.push('apply-labels');
  if (outcome.status === 'fail') effects.push('fail-workflow');
  return effects;
}

export function renderSummaryMarkdown(decision: RightsizingDecision): string {
  const header = [
    COMMENT_MARKER,
    '## JEV Resource RightSizer',
    '',
    `- Recommendation: \`${decision.recommendation}\``,
    `- Confidence: ${decision.confidence.toFixed(3)}`,
    `- Provisional: ${decision.provisional ? 'yes' : 'no'}`,
    `- Environment: ${decision.environment}`,
    `- Resources: ${decision.resource_count}`,
    `- Partial metrics: ${decision.partial_count}`,
    `- Reason codes: ${decision.reason_codes.map(code => `\`${code}\``).join(', ')}`,
    '',
    decision.explanation,
    '',
    '| Resource | Kind | Metric | Avg | Signal |',
    '| --- | --- | --- | --- | --- |',
  ];
  const rows: string[] = [];
  for (const resource of decision.resources.slice(0, 50)) {
    for (const metric of resource.metrics.slice(0, 8)) {
      const avg = metric.stats.avg == null ? '' : metric.stats.avg.toFixed(2);
      rows.push(
        `| ${escapeCell(resource.resource_id)} | ${escapeCell(resource.resource_kind)} | ${escapeCell(metric.name)} | ${avg} | ${metric.signal} |`,
      );
    }
  }
  if (rows.length > 100) rows.length = 100;
  header.push(...rows);
  header.push('', 'Metrics are never omitted. This action does not change infrastructure.');
  return header.join('\n');
}

export interface CommentClient {
  listComments(): Promise<Array<{ id: number; body: string }>>;
  createComment(body: string): Promise<void>;
  updateComment(id: number, body: string): Promise<void>;
}

export async function maybePostComment(
  enabled: boolean,
  dryRun: boolean,
  decision: RightsizingDecision,
  client: CommentClient | null,
): Promise<'posted' | 'updated' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  const body = renderSummaryMarkdown(decision);
  if (dryRun || !client) return 'dry-run';
  const existing = await client.listComments();
  const match = existing.find(comment => comment.body.includes(COMMENT_MARKER));
  if (match) {
    await client.updateComment(match.id, body);
    return 'updated';
  }
  await client.createComment(body);
  return 'posted';
}
