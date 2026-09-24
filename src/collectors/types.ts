import type { ResourceEvidence } from '../schemas/metrics.js';
import type { MetricSource } from '../schemas/enums.js';

export interface MetricBatch {
  resources: ResourceEvidence[];
  warnings: string[];
  sources: MetricSource[];
}

/** Every connector returns one batch containing all resources and metric series it collected. */
export type CollectResult = MetricBatch;

export type ConnectorFetch = typeof fetch;
