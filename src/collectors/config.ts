import { existsSync } from 'node:fs';
import { z } from 'zod';
import {
  ENVIRONMENTS,
  JEV_PROVIDERS,
  LOW_CONFIDENCE_POLICIES,
  type EnvironmentName,
  type JevProviderId,
  type LowConfidencePolicy,
} from '../schemas/enums.js';
import { ThresholdsSchema } from '../schemas/metrics.js';
import { parseYamlOrJson, readBounded } from '../utils/fs.js';
import { resolveInside } from '../utils/sanitize.js';

export const RightsizerConfigSchema = z
  .object({
    jev_provider: z.enum(JEV_PROVIDERS).optional(),
    jev_endpoint: z.string().url().optional(),
    jev_model: z.string().min(1).optional(),
    min_confidence: z.number().min(0).max(1).optional(),
    low_confidence_policy: z.enum(LOW_CONFIDENCE_POLICIES).optional(),
    environment: z.enum(ENVIRONMENTS).optional(),
    window_start: z.string().optional(),
    window_end: z.string().optional(),
    thresholds: ThresholdsSchema.partial().optional(),
    metrics_path: z.string().optional(),
    comment_on_github: z.boolean().optional(),
    apply_labels: z.boolean().optional(),
    create_check_run: z.boolean().optional(),
    redact_resource_names: z.boolean().optional(),
    fail_on_review: z.boolean().optional(),
    fail_on_scale_up: z.boolean().optional(),
    fail_on_scale_down: z.boolean().optional(),
    decision_json_path: z.string().optional(),
    sarif_path: z.string().optional(),
    cloudwatch_namespace: z.string().optional(),
    cloudwatch_metric_name: z.string().optional(),
    cloudwatch_dimensions: z.string().optional(),
    cloudwatch_resource_id: z.string().optional(),
    azure_resource_id: z.string().optional(),
    azure_metric_names: z.string().optional(),
    gcp_project_id: z.string().optional(),
    gcp_metric_type: z.string().optional(),
    gcp_resource_id: z.string().optional(),
    prometheus_url: z.string().optional(),
    prometheus_queries_path: z.string().optional(),
    prometheus_resource_id: z.string().optional(),
    include_resources: z.array(z.string()).optional(),
    exclude_resources: z.array(z.string()).optional(),
  })
  .strict();

export type RightsizerConfig = z.infer<typeof RightsizerConfigSchema>;

export function loadRightsizerConfig(workspace: string, relativePath = '.jev/config.yml'): RightsizerConfig {
  const full = resolveInside(workspace, relativePath);
  if (!existsSync(full)) return {};
  return RightsizerConfigSchema.parse(parseYamlOrJson(readBounded(full), relativePath) ?? {});
}

export function pickString(input: string | undefined, config: string | undefined, fallback?: string): string | undefined {
  const value = input?.trim() ? input.trim() : config ?? fallback;
  return value || undefined;
}

export function pickNumber(input: string | undefined, config: number | undefined, fallback: number): number {
  if (input?.trim()) return Number(input);
  return config ?? fallback;
}

export function pickBoolean(input: string | undefined, config: boolean | undefined, fallback: boolean): boolean {
  if (input?.trim()) {
    if (input !== 'true' && input !== 'false') throw new Error(`Expected true or false, received ${input}`);
    return input === 'true';
  }
  return config ?? fallback;
}

export function pickProvider(input: string | undefined, config: RightsizerConfig): JevProviderId {
  const value = pickString(input, config.jev_provider, 'vercel-ai-gateway') as JevProviderId;
  if (!JEV_PROVIDERS.includes(value)) throw new Error(`Unsupported jev_provider: ${value}`);
  return value;
}

export function pickPolicy(input: string | undefined, config: RightsizerConfig): LowConfidencePolicy {
  const value = pickString(input, config.low_confidence_policy, 'fail') as LowConfidencePolicy;
  if (!LOW_CONFIDENCE_POLICIES.includes(value)) throw new Error(`Unsupported low_confidence_policy: ${value}`);
  return value;
}

export function pickEnvironment(input: string | undefined, config: RightsizerConfig): EnvironmentName {
  const value = pickString(input, config.environment, 'production') as EnvironmentName;
  if (!ENVIRONMENTS.includes(value)) throw new Error(`Unsupported environment: ${value}`);
  return value;
}

export function splitList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function pickList(input: string | undefined, config: string[] | undefined): string[] {
  const fromInput = splitList(input);
  return fromInput.length ? fromInput : config ?? [];
}

export function parseCloudWatchDimensions(raw: string | undefined): Array<{ Name: string; Value: string }> {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as Array<{ Name?: string; name?: string; Value?: string; value?: string }>;
    return parsed.map(item => ({
      Name: item.Name ?? item.name ?? '',
      Value: item.Value ?? item.value ?? '',
    })).filter(item => item.Name && item.Value);
  }
  return trimmed.split(',').map(pair => {
    const [Name, ...rest] = pair.split('=');
    return { Name: (Name ?? '').trim(), Value: rest.join('=').trim() };
  }).filter(item => item.Name && item.Value);
}
