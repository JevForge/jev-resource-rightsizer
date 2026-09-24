import type { ResourceEvidence } from '../schemas/metrics.js';
import type { MetricSource } from '../schemas/enums.js';

export interface CollectResult {
  resources: ResourceEvidence[];
  warnings: string[];
  sources: MetricSource[];
}

export type ConnectorFetch = typeof fetch;
