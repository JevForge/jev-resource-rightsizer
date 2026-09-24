import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyResourceFilters, activeResources } from '../../src/collectors/filters.js';
import { resource } from '../helpers.js';

describe('resource filters', () => {
  it('marks excluded resources while preserving them for output visibility', () => {
    const filtered = applyResourceFilters(
      [
        resource({ resource_id: 'api-prod-1' }),
        resource({ resource_id: 'worker-prod-1' }),
      ],
      { include: ['api-*'] },
    );

    expect(filtered.map(item => item.excluded)).toEqual([false, true]);
    expect(activeResources(filtered).map(item => item.resource_id)).toEqual(['api-prod-1']);
  });

  it('exposes include and exclude inputs from the Action contract', () => {
    const action = readFileSync(new URL('../../action.yml', import.meta.url), 'utf8');
    expect(action).toContain('include_resources:');
    expect(action).toContain('exclude_resources:');
  });
});
