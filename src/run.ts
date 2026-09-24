import type { JevProviderId, LowConfidencePolicy } from './schemas/enums.js';
import type { RightsizingReport } from './collectors/aggregate.js';
import { applyRightsizingPolicy, type PolicyOutcome } from './decision/policy.js';
import { effectsFor, maybePostComment, renderSummaryMarkdown, type CommentClient } from './executors/effects.js';
import {
  applyRightsizingLabels,
  maybeCreateCheckRun,
  type CheckRunClient,
  type LabelClient,
} from './executors/github-status.js';
import { createJevProvider } from './jev/factory.js';
import { assertStateFits, buildEvaluationState } from './jev/questions.js';
import { normalizeAnswer } from './jev/normalize.js';
import type { JevProvider } from './jev/types.js';
import { redactResource } from './utils/sanitize.js';

export interface RunRightsizerParams {
  report: RightsizingReport;
  minConfidence: number;
  lowConfidencePolicy: LowConfidencePolicy;
  allowPartial: boolean;
  allowInsufficient: boolean;
  failOnReview: boolean;
  failOnScaleUp: boolean;
  failOnScaleDown: boolean;
  jevProvider: JevProviderId;
  jevEndpoint?: string;
  jevModel?: string;
  timeoutMs: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  provider?: JevProvider;
  redactResourceNames: boolean;
  commentOnGithub: boolean;
  applyLabels: boolean;
  createCheckRun: boolean;
  dryRun: boolean;
  headSha?: string | null;
  commentClient?: CommentClient | null;
  labelClient?: LabelClient | null;
  checkRunClient?: CheckRunClient | null;
}

export interface RunRightsizerResult {
  outcome: PolicyOutcome;
  markdown: string;
  commentStatus: 'posted' | 'updated' | 'dry-run' | 'skipped';
  labelStatus: 'applied' | 'dry-run' | 'skipped';
  checkRunStatus: 'created' | 'dry-run' | 'skipped';
  effects: string[];
}

export async function runResourceRightsizer(params: RunRightsizerParams): Promise<RunRightsizerResult> {
  const report = params.redactResourceNames
    ? { ...params.report, resources: params.report.resources.map(redactResource) }
    : params.report;
  const state = buildEvaluationState(report);
  assertStateFits(state);
  const provider =
    params.provider ??
    createJevProvider({
      provider: params.jevProvider,
      apiKey: params.apiKey,
      endpoint: params.jevEndpoint,
      model: params.jevModel,
      timeoutMs: params.timeoutMs,
      fetchImpl: params.fetchImpl,
    });
  const answer = await provider.evaluateRightsizing(state);
  const decision = normalizeAnswer(answer, report);
  const outcome = applyRightsizingPolicy(decision, report, {
    minConfidence: params.minConfidence,
    lowConfidencePolicy: params.lowConfidencePolicy,
    allowPartial: params.allowPartial,
    allowInsufficient: params.allowInsufficient,
    failOnReview: params.failOnReview,
    failOnScaleUp: params.failOnScaleUp,
    failOnScaleDown: params.failOnScaleDown,
  });
  const effects = effectsFor(outcome, {
    comment: params.commentOnGithub && !params.dryRun,
    checkRun: params.createCheckRun && !params.dryRun && Boolean(params.headSha),
    labels: params.applyLabels && !params.dryRun,
  });
  const markdown = renderSummaryMarkdown(outcome.decision);
  const commentStatus = await maybePostComment(
    params.commentOnGithub,
    params.dryRun,
    outcome.decision,
    params.commentClient ?? null,
  );
  const labelStatus = await applyRightsizingLabels(
    params.applyLabels,
    params.dryRun,
    outcome.decision,
    params.labelClient ?? null,
  );
  const checkRunStatus = await maybeCreateCheckRun(
    params.createCheckRun,
    params.dryRun,
    params.headSha ?? null,
    outcome,
    params.checkRunClient ?? null,
  );
  return { outcome, markdown, commentStatus, labelStatus, checkRunStatus, effects };
}
