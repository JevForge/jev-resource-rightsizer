import { describe, expect, it } from 'vitest';
import { report, resource } from '../helpers.js';

describe('per-resource recommendations', () => {
  it('keeps the global decision while exposing each resource baseline', () => {
    const result = report([
      resource({ resource_id: 'api-low', cpu: 10, memory: 20 }),
      resource({ resource_id: 'api-hot', cpu: 92, memory: 88 }),
    ]);

    expect(result.heuristic_recommendation).toBe('review');
    expect(result.per_resource_recommendations.map(item => [item.resource_id, item.recommendation])).toEqual([
      ['api-low', 'scale-down'],
      ['api-hot', 'scale-up'],
    ]);
  });
});
