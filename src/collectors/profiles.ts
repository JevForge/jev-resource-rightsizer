import { THRESHOLD_PROFILES, type EnvironmentName, type ThresholdProfile } from '../schemas/enums.js';
import type { Thresholds } from '../schemas/metrics.js';

export { THRESHOLD_PROFILES };

const PROFILE_THRESHOLDS: Record<ThresholdProfile, Thresholds> = {
  conservative: {
    scale_down_cpu_pct: 15,
    scale_up_cpu_pct: 70,
    scale_down_memory_pct: 25,
    scale_up_memory_pct: 75,
    min_sample_count: 24,
    spike_ratio: 2,
  },
  balanced: {
    scale_down_cpu_pct: 20,
    scale_up_cpu_pct: 75,
    scale_down_memory_pct: 30,
    scale_up_memory_pct: 80,
    min_sample_count: 12,
    spike_ratio: 2.5,
  },
  aggressive: {
    scale_down_cpu_pct: 30,
    scale_up_cpu_pct: 85,
    scale_down_memory_pct: 40,
    scale_up_memory_pct: 90,
    min_sample_count: 8,
    spike_ratio: 3,
  },
};

export function thresholdsForProfile(profile: ThresholdProfile): Thresholds {
  return { ...PROFILE_THRESHOLDS[profile] };
}

export function defaultThresholdProfile(environment: EnvironmentName): ThresholdProfile {
  return environment === 'production' ? 'conservative' : 'balanced';
}
