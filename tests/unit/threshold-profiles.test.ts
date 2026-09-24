import { describe, expect, it } from 'vitest';
import { defaultThresholdProfile, thresholdsForProfile } from '../../src/collectors/profiles.js';

describe('threshold profiles', () => {
  it('keeps balanced compatible and makes production conservative by default', () => {
    expect(thresholdsForProfile('balanced')).toEqual({
      scale_down_cpu_pct: 20,
      scale_up_cpu_pct: 75,
      scale_down_memory_pct: 30,
      scale_up_memory_pct: 80,
      min_sample_count: 12,
      spike_ratio: 2.5,
    });
    expect(defaultThresholdProfile('production')).toBe('conservative');
    expect(defaultThresholdProfile('staging')).toBe('balanced');
  });

  it('makes aggressive and conservative tradeoffs explicit', () => {
    const conservative = thresholdsForProfile('conservative');
    const aggressive = thresholdsForProfile('aggressive');
    expect(conservative.scale_down_cpu_pct).toBeLessThan(aggressive.scale_down_cpu_pct);
    expect(conservative.scale_up_cpu_pct).toBeLessThan(aggressive.scale_up_cpu_pct);
    expect(conservative.min_sample_count).toBeGreaterThan(aggressive.min_sample_count);
  });
});
