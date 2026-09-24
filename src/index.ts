import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  loadRightsizerConfig,
  pickBoolean,
  pickEnvironment,
  pickNumber,
  pickPolicy,
  pickProvider,
  pickString,
  splitList,
} from './collectors/config.js';
import { loadMetricsReport } from './collectors/load.js';
import { ThresholdsSchema } from './schemas/metrics.js';
import { applyOutcome } from './github/outputs.js';
import { writeDecisionJson, writeDecisionSarif } from './github/artifacts.js';
import { runResourceRightsizer } from './run.js';
import { defaultWindow } from './utils/stats.js';
import { safeError } from './utils/sanitize.js';
import type { CommentClient } from './executors/effects.js';
import type { CheckRunClient, LabelClient } from './executors/github-status.js';

const LOG = '[JEV Resource RightSizer]';

function env(name: string): string | undefined {
  const value = process.env[name];
  return value?.trim() ? value : undefined;
}

function resolveApiKey(provider: string): string | undefined {
  if (provider === 'vercel-ai-gateway') return env('AI_GATEWAY_API_KEY');
  if (provider === 'typesafe-native') return env('TYPESAFE_API_KEY');
  return env('JEV_CUSTOM_API_KEY') || env('CUSTOM_JEV_API_KEY');
}

async function main(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const config = loadRightsizerConfig(workspace);
  const jevProvider = pickProvider(core.getInput('jev_provider'), config);
  const environment = pickEnvironment(core.getInput('environment'), config);
  const fallbackWindow = defaultWindow();
  const window = {
    start: pickString(core.getInput('window_start'), config.window_start, fallbackWindow.start) ?? fallbackWindow.start,
    end: pickString(core.getInput('window_end'), config.window_end, fallbackWindow.end) ?? fallbackWindow.end,
  };
  const thresholds = ThresholdsSchema.parse({
    scale_down_cpu_pct: pickNumber(
      core.getInput('scale_down_cpu_pct'),
      config.thresholds?.scale_down_cpu_pct,
      20,
    ),
    scale_up_cpu_pct: pickNumber(core.getInput('scale_up_cpu_pct'), config.thresholds?.scale_up_cpu_pct, 75),
    scale_down_memory_pct: pickNumber(
      core.getInput('scale_down_memory_pct'),
      config.thresholds?.scale_down_memory_pct,
      30,
    ),
    scale_up_memory_pct: pickNumber(
      core.getInput('scale_up_memory_pct'),
      config.thresholds?.scale_up_memory_pct,
      80,
    ),
    min_sample_count: pickNumber(
      core.getInput('min_sample_count'),
      config.thresholds?.min_sample_count,
      12,
    ),
    spike_ratio: pickNumber(core.getInput('spike_ratio'), config.thresholds?.spike_ratio, 2.5),
  });

  const metricsJson = core.getInput('metrics_json').trim();
  const metricsPath = pickString(core.getInput('metrics_path'), config.metrics_path);
  if (metricsJson && metricsPath) {
    throw new Error(`${LOG} Pass metrics_json or metrics_path, not both`);
  }

  const cloudwatchEnabled = pickBoolean(core.getInput('cloudwatch_enabled'), undefined, false);
  const azureEnabled = pickBoolean(core.getInput('azure_enabled'), undefined, false);
  const gcpEnabled = pickBoolean(core.getInput('gcp_enabled'), undefined, false);
  const prometheusEnabled = pickBoolean(core.getInput('prometheus_enabled'), undefined, false);

  core.info(`${LOG} Jev provider: ${jevProvider}`);
  core.info(
    `${LOG} Data sent to Jev: resource ids (optionally redacted), metric aggregates, thresholds, environment, and window. Credentials and secrets are not sent.`,
  );

  const report = await loadMetricsReport({
    workspace,
    environment,
    window,
    thresholds,
    metricsPath,
    metricsDocument: metricsJson ? (JSON.parse(metricsJson) as unknown) : undefined,
    cloudwatch: {
      enabled: cloudwatchEnabled,
      namespace: pickString(core.getInput('cloudwatch_namespace'), config.cloudwatch_namespace),
      metricName: pickString(core.getInput('cloudwatch_metric_name'), config.cloudwatch_metric_name),
      dimensionsRaw: pickString(core.getInput('cloudwatch_dimensions'), config.cloudwatch_dimensions),
      resourceId: pickString(core.getInput('cloudwatch_resource_id'), config.cloudwatch_resource_id),
      service: pickString(core.getInput('cloudwatch_service'), undefined, 'aws'),
    },
    azure: {
      enabled: azureEnabled,
      resourceId: pickString(core.getInput('azure_resource_id'), config.azure_resource_id),
      metricNames: (() => {
        const fromInput = splitList(core.getInput('azure_metric_names'));
        if (fromInput.length) return fromInput;
        return splitList(config.azure_metric_names);
      })(),
      timeoutMs: pickNumber(core.getInput('connector_timeout_ms'), undefined, 20_000),
      credentials: azureEnabled
        ? {
            tenantId: env('AZURE_TENANT_ID') ?? '',
            clientId: env('AZURE_CLIENT_ID') ?? '',
            clientSecret: env('AZURE_CLIENT_SECRET') ?? '',
            subscriptionId: pickString(core.getInput('azure_subscription_id'), env('AZURE_SUBSCRIPTION_ID')) ?? '',
          }
        : undefined,
    },
    gcp: {
      enabled: gcpEnabled,
      projectId: pickString(core.getInput('gcp_project_id'), config.gcp_project_id ?? env('GCP_PROJECT_ID')),
      metricType: pickString(core.getInput('gcp_metric_type'), config.gcp_metric_type),
      resourceId: pickString(core.getInput('gcp_resource_id'), config.gcp_resource_id),
      timeoutMs: pickNumber(core.getInput('connector_timeout_ms'), undefined, 20_000),
      accessToken: env('GCP_ACCESS_TOKEN'),
    },
    prometheus: {
      enabled: prometheusEnabled,
      baseUrl: pickString(core.getInput('prometheus_url'), config.prometheus_url ?? env('PROMETHEUS_URL')),
      resourceId: pickString(core.getInput('prometheus_resource_id'), config.prometheus_resource_id),
      queriesPath: pickString(core.getInput('prometheus_queries_path'), config.prometheus_queries_path),
      bearerToken: env('PROMETHEUS_BEARER_TOKEN'),
      timeoutMs: pickNumber(core.getInput('connector_timeout_ms'), undefined, 20_000),
    },
  });

  const commentOnGithub = pickBoolean(core.getInput('comment_on_github'), config.comment_on_github, false);
  const applyLabels = pickBoolean(core.getInput('apply_labels'), config.apply_labels, false);
  const createCheckRun = pickBoolean(core.getInput('create_check_run'), config.create_check_run, true);
  const dryRun = pickBoolean(core.getInput('dry_run'), undefined, false);
  const token = core.getInput('github_token') || process.env.GITHUB_TOKEN;
  const issueNumber = github.context.payload.pull_request?.number ?? github.context.issue?.number;
  const octokit = token ? github.getOctokit(token) : null;

  const commentClient: CommentClient | null =
    commentOnGithub && !dryRun && octokit && issueNumber
      ? {
          async listComments() {
            const comments = await octokit.rest.issues.listComments({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: issueNumber,
              per_page: 100,
            });
            return comments.data.map(comment => ({ id: comment.id, body: comment.body ?? '' }));
          },
          async createComment(body: string) {
            await octokit.rest.issues.createComment({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: issueNumber,
              body,
            });
          },
          async updateComment(id: number, body: string) {
            await octokit.rest.issues.updateComment({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              comment_id: id,
              body,
            });
          },
        }
      : null;

  const labelClient: LabelClient | null =
    applyLabels && !dryRun && octokit && issueNumber
      ? {
          async listLabels() {
            const issue = await octokit.rest.issues.get({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: issueNumber,
            });
            return (issue.data.labels ?? [])
              .map(label => (typeof label === 'string' ? label : label.name))
              .filter((name): name is string => typeof name === 'string');
          },
          async ensureLabel(name: string) {
            try {
              await octokit.rest.issues.createLabel({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                name,
                color: '0E8A16',
                description: 'Managed by JEV Resource RightSizer',
              });
            } catch (error) {
              const status =
                error && typeof error === 'object' && 'status' in error
                  ? Number((error as { status?: number }).status)
                  : undefined;
              if (status !== 422) throw error;
            }
          },
          async setLabels(next: string[]) {
            await octokit.rest.issues.setLabels({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: issueNumber,
              labels: next,
            });
          },
        }
      : null;

  const headSha = github.context.payload.pull_request?.head?.sha ?? github.context.sha ?? null;
  const checkRunClient: CheckRunClient | null = octokit
    ? {
        async createCheckRun(input) {
          await octokit.rest.checks.create({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            name: input.name,
            head_sha: input.headSha,
            status: 'completed',
            conclusion: input.conclusion,
            output: {
              title: input.title,
              summary: input.summary,
            },
          });
        },
      }
    : null;

  const result = await runResourceRightsizer({
    report,
    minConfidence: pickNumber(core.getInput('min_confidence'), config.min_confidence, 0.75),
    lowConfidencePolicy: pickPolicy(core.getInput('low_confidence_policy'), config),
    allowPartial: pickBoolean(core.getInput('allow_partial'), undefined, false),
    allowInsufficient: pickBoolean(core.getInput('allow_insufficient'), undefined, false),
    failOnReview: pickBoolean(core.getInput('fail_on_review'), config.fail_on_review, false),
    failOnScaleUp: pickBoolean(core.getInput('fail_on_scale_up'), config.fail_on_scale_up, false),
    failOnScaleDown: pickBoolean(core.getInput('fail_on_scale_down'), config.fail_on_scale_down, false),
    jevProvider,
    jevEndpoint: pickString(core.getInput('jev_endpoint'), config.jev_endpoint),
    jevModel: pickString(core.getInput('jev_model'), config.jev_model),
    timeoutMs: pickNumber(core.getInput('timeout_ms'), undefined, 45_000),
    apiKey: resolveApiKey(jevProvider),
    redactResourceNames: pickBoolean(core.getInput('redact_resource_names'), config.redact_resource_names, true),
    commentOnGithub,
    applyLabels,
    createCheckRun,
    dryRun,
    headSha,
    commentClient,
    labelClient,
    checkRunClient,
  });

  await applyOutcome(
    {
      setOutput: (name, value) => core.setOutput(name, value),
      setFailed: message => core.setFailed(message),
      warning: message => core.warning(message),
      info: message => core.info(message),
      summary: async markdown => {
        await core.summary.addRaw(markdown).write();
      },
    },
    result.outcome,
    result.markdown,
  );

  const decisionJsonPath = pickString(core.getInput('decision_json_path'), config.decision_json_path);
  if (decisionJsonPath) {
    const written = writeDecisionJson(workspace, decisionJsonPath, result.outcome.decision);
    core.info(`${LOG} Wrote decision JSON to ${written}`);
    core.setOutput('decision_json_path', decisionJsonPath);
  } else {
    core.setOutput('decision_json_path', '');
  }
  const sarifPath = pickString(core.getInput('sarif_path'), config.sarif_path);
  if (sarifPath) {
    const written = writeDecisionSarif(workspace, sarifPath, result.outcome.decision);
    core.info(`${LOG} Wrote SARIF to ${written}`);
    core.setOutput('sarif_path', sarifPath);
  } else {
    core.setOutput('sarif_path', '');
  }

  core.info(`${LOG} Comment: ${result.commentStatus}`);
  core.info(`${LOG} Labels: ${result.labelStatus}`);
  core.info(`${LOG} Check run: ${result.checkRunStatus}`);
  core.info(`${LOG} Effects: ${result.effects.join(', ')}`);
}

main().catch(error => {
  const message = safeError(error);
  core.setFailed(message.startsWith(LOG) ? message : `${LOG} ${message}`);
});
