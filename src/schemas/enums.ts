export const RECOMMENDATIONS = ['scale-down', 'keep', 'scale-up', 'review'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const JEV_PROVIDERS = [
  'vercel-ai-gateway',
  'typesafe-native',
  'custom-compatible',
] as const;
export type JevProviderId = (typeof JEV_PROVIDERS)[number];

export const LOW_CONFIDENCE_POLICIES = ['fail', 'warn', 'request-review', 'no-op'] as const;
export type LowConfidencePolicy = (typeof LOW_CONFIDENCE_POLICIES)[number];

export const ENVIRONMENTS = [
  'production',
  'staging',
  'development',
  'sandbox',
  'other',
] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];

export const METRIC_KINDS = [
  'cpu',
  'memory',
  'network',
  'disk',
  'requests',
  'cost',
  'custom',
] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];

export const METRIC_UNITS = [
  'percent',
  'bytes',
  'bytes_per_sec',
  'requests_per_sec',
  'count',
  'usd_per_hour',
  'usd_per_month',
  'ratio',
  'other',
] as const;
export type MetricUnit = (typeof METRIC_UNITS)[number];

export const METRIC_SOURCES = [
  'normalized',
  'cloudwatch',
  'azure-monitor',
  'gcp-monitoring',
  'prometheus',
] as const;
export type MetricSource = (typeof METRIC_SOURCES)[number];

export const RESOURCE_KINDS = [
  'compute',
  'container',
  'database',
  'cache',
  'storage',
  'load-balancer',
  'function',
  'other',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const SIGNAL_STRENGTHS = ['strong', 'moderate', 'weak', 'insufficient'] as const;
export type SignalStrength = (typeof SIGNAL_STRENGTHS)[number];

export const REASON_CODES = [
  'CPU_UNDERUTILIZED',
  'CPU_SATURATED',
  'MEMORY_UNDERUTILIZED',
  'MEMORY_PRESSURE',
  'REQUEST_LOAD_LOW',
  'REQUEST_LOAD_HIGH',
  'COST_HIGH_RELATIVE',
  'COST_EFFICIENT',
  'DISK_PRESSURE',
  'NETWORK_ANOMALY',
  'HEADROOM_AMPLE',
  'HEADROOM_TIGHT',
  'MIXED_SIGNALS',
  'INSUFFICIENT_SAMPLES',
  'PARTIAL_METRICS',
  'PROD_ENVIRONMENT',
  'NON_PROD_ENVIRONMENT',
  'LOW_CONFIDENCE',
  'JEV_UNAVAILABLE',
  'POLICY_MANUAL_REVIEW',
  'MULTI_SOURCE',
  'THRESHOLD_SCALE_DOWN',
  'THRESHOLD_SCALE_UP',
  'WITHIN_BAND',
  'SPIKE_DETECTED',
  'TREND_RISING',
  'TREND_FALLING',
  'RIGHTSIZING_VISIBILITY_ENFORCED',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
