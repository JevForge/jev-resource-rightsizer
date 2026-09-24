import { existsSync } from 'node:fs';
import { z } from 'zod';
import { ThresholdsSchema, type ObservationWindow, type Thresholds } from '../schemas/metrics.js';
import type { EnvironmentName } from '../schemas/enums.js';
import { parseYamlOrJson, readBounded } from '../utils/fs.js';
import { resolveInside } from '../utils/sanitize.js';
import { aggregateReport, type RightsizingReport } from './aggregate.js';
import { parseNormalizedMetrics } from './normalized.js';
import { collectCloudWatch, createDefaultCloudWatchClient, type CloudWatchClient } from './cloudwatch.js';
import { acquireAzureToken, collectAzureMonitor } from './azure-monitor.js';
import { collectGcpMonitoring } from './gcp-monitoring.js';
import { collectPrometheus, type PrometheusQuery } from './prometheus.js';
import type { CollectResult, ConnectorFetch } from './types.js';
import { parseCloudWatchDimensions } from './config.js';
import { actionError } from '../utils/errors.js';

const PrometheusQueriesSchema = z.array(
  z
    .object({
      name: z.string().min(1),
      query: z.string().min(1),
      kind: z.enum(['cpu', 'memory', 'network', 'disk', 'requests', 'cost', 'custom']),
      unit: z
        .enum([
          'percent',
          'bytes',
          'bytes_per_sec',
          'requests_per_sec',
          'count',
          'usd_per_hour',
          'usd_per_month',
          'ratio',
          'other',
        ])
        .optional(),
    })
    .strict(),
);

export interface LoadMetricsInput {
  workspace: string;
  environment: EnvironmentName;
  window: ObservationWindow;
  thresholds: Thresholds;
  metricsPath?: string;
  metricsDocument?: unknown;
  cloudwatch?: {
    enabled: boolean;
    namespace?: string;
    metricName?: string;
    dimensionsRaw?: string;
    resourceId?: string;
    service?: string;
    client?: CloudWatchClient;
  };
  azure?: {
    enabled: boolean;
    resourceId?: string;
    metricNames?: string[];
    service?: string;
    timeoutMs: number;
    credentials?: {
      tenantId: string;
      clientId: string;
      clientSecret: string;
      subscriptionId: string;
    };
    accessToken?: string;
    fetchImpl?: ConnectorFetch;
  };
  gcp?: {
    enabled: boolean;
    projectId?: string;
    metricType?: string;
    resourceId?: string;
    service?: string;
    timeoutMs: number;
    accessToken?: string;
    fetchImpl?: ConnectorFetch;
  };
  prometheus?: {
    enabled: boolean;
    baseUrl?: string;
    resourceId?: string;
    service?: string;
    queriesPath?: string;
    queries?: PrometheusQuery[];
    bearerToken?: string;
    timeoutMs: number;
    fetchImpl?: ConnectorFetch;
  };
}

export async function loadMetricsReport(input: LoadMetricsInput): Promise<RightsizingReport> {
  const collected: CollectResult[] = [];

  if (input.metricsDocument != null) {
    collected.push(
      parseNormalizedMetrics(input.metricsDocument, {
        environment: input.environment,
        minSampleCount: input.thresholds.min_sample_count,
      }),
    );
  } else if (input.metricsPath) {
    const full = resolveInside(input.workspace, input.metricsPath);
    if (!existsSync(full)) throw new Error(actionError(`metrics_path not found: ${input.metricsPath}`));
    collected.push(
      parseNormalizedMetrics(parseYamlOrJson(readBounded(full), input.metricsPath), {
        environment: input.environment,
        minSampleCount: input.thresholds.min_sample_count,
      }),
    );
  }

  if (input.cloudwatch?.enabled) {
    if (!input.cloudwatch.namespace || !input.cloudwatch.metricName || !input.cloudwatch.resourceId) {
      throw new Error(
        actionError(
          'cloudwatch_enabled requires cloudwatch_namespace, cloudwatch_metric_name, and cloudwatch_resource_id',
        ),
      );
    }
    const client = input.cloudwatch.client ?? (await createDefaultCloudWatchClient());
    collected.push(
      await collectCloudWatch({
        environment: input.environment,
        window: input.window,
        namespace: input.cloudwatch.namespace,
        metricName: input.cloudwatch.metricName,
        dimensions: parseCloudWatchDimensions(input.cloudwatch.dimensionsRaw),
        resourceId: input.cloudwatch.resourceId,
        service: input.cloudwatch.service ?? 'aws',
        client,
        minSampleCount: input.thresholds.min_sample_count,
      }),
    );
  }

  if (input.azure?.enabled) {
    if (!input.azure.resourceId) throw new Error(actionError('azure_enabled requires azure_resource_id'));
    const token =
      input.azure.accessToken ??
      (input.azure.credentials
        ? await acquireAzureToken({
            ...input.azure.credentials,
            timeoutMs: input.azure.timeoutMs,
            fetchImpl: input.azure.fetchImpl,
          })
        : undefined);
    if (!token) {
      throw new Error(
        actionError('Azure Monitor authentication failed. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.'),
      );
    }
    collected.push(
      await collectAzureMonitor({
        environment: input.environment,
        window: input.window,
        subscriptionId: input.azure.credentials?.subscriptionId ?? '',
        resourceId: input.azure.resourceId,
        metricNames: input.azure.metricNames?.length ? input.azure.metricNames : ['Percentage CPU'],
        accessToken: token,
        service: input.azure.service,
        timeoutMs: input.azure.timeoutMs,
        fetchImpl: input.azure.fetchImpl,
        minSampleCount: input.thresholds.min_sample_count,
      }),
    );
  }

  if (input.gcp?.enabled) {
    if (!input.gcp.projectId || !input.gcp.metricType || !input.gcp.resourceId) {
      throw new Error(
        actionError('gcp_enabled requires gcp_project_id, gcp_metric_type, and gcp_resource_id'),
      );
    }
    if (!input.gcp.accessToken) {
      throw new Error(actionError('GCP Monitoring authentication failed. Set GCP_ACCESS_TOKEN.'));
    }
    collected.push(
      await collectGcpMonitoring({
        environment: input.environment,
        window: input.window,
        projectId: input.gcp.projectId,
        resourceId: input.gcp.resourceId,
        metricType: input.gcp.metricType,
        accessToken: input.gcp.accessToken,
        service: input.gcp.service,
        timeoutMs: input.gcp.timeoutMs,
        fetchImpl: input.gcp.fetchImpl,
        minSampleCount: input.thresholds.min_sample_count,
      }),
    );
  }

  if (input.prometheus?.enabled) {
    if (!input.prometheus.baseUrl || !input.prometheus.resourceId) {
      throw new Error(
        actionError('prometheus_enabled requires prometheus_url and prometheus_resource_id'),
      );
    }
    let queries = input.prometheus.queries ?? [];
    if (!queries.length && input.prometheus.queriesPath) {
      const full = resolveInside(input.workspace, input.prometheus.queriesPath);
      queries = PrometheusQueriesSchema.parse(parseYamlOrJson(readBounded(full), input.prometheus.queriesPath));
    }
    if (!queries.length) {
      throw new Error(
        actionError('prometheus_enabled requires prometheus_queries_path or inline queries'),
      );
    }
    collected.push(
      await collectPrometheus({
        environment: input.environment,
        window: input.window,
        baseUrl: input.prometheus.baseUrl,
        resourceId: input.prometheus.resourceId,
        service: input.prometheus.service,
        queries,
        bearerToken: input.prometheus.bearerToken,
        timeoutMs: input.prometheus.timeoutMs,
        fetchImpl: input.prometheus.fetchImpl,
        minSampleCount: input.thresholds.min_sample_count,
      }),
    );
  }

  return aggregateReport({
    environment: input.environment,
    window: input.window,
    thresholds: ThresholdsSchema.parse(input.thresholds),
    collected,
  });
}
