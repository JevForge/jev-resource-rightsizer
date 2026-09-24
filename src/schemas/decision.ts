import { z } from 'zod';
import { REASON_CODES, RECOMMENDATIONS } from './enums.js';
import { MetricSeriesSchema, ObservationWindowSchema, ResourceEvidenceSchema, ThresholdsSchema } from './metrics.js';

export const RightsizingDecisionSchema = z
  .object({
    recommendation: z.enum(RECOMMENDATIONS),
    confidence: z.number().min(0).max(1),
    reason_codes: z.array(z.enum(REASON_CODES)).min(1).max(24),
    environment: z.string().min(1).max(32),
    window: ObservationWindowSchema,
    resource_count: z.number().int().nonnegative(),
    primary_resource_id: z.string().min(1).max(256).nullable(),
    supporting_metrics: z.array(MetricSeriesSchema).max(128),
    resources: z.array(ResourceEvidenceSchema).max(500),
    thresholds: ThresholdsSchema,
    summary: z.string().min(1).max(500),
    explanation: z.string().max(2_000),
    provisional: z.boolean(),
    sources: z.array(z.string().min(1).max(64)).max(16),
    partial_count: z.number().int().nonnegative(),
    insufficient_count: z.number().int().nonnegative(),
  })
  .strict();

export type RightsizingDecision = z.infer<typeof RightsizingDecisionSchema>;
