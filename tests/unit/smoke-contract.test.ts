import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('provider mock smoke contract', () => {
  it('ships a workflow_dispatch workflow and a closed golden fixture', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/smoke.yml', import.meta.url), 'utf8');
    const fixture = JSON.parse(readFileSync(new URL('../fixtures/smoke-golden.json', import.meta.url), 'utf8')) as {
      provider_response?: unknown;
      expected?: { recommendation?: string };
    };
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('smoke-e2e.mjs');
    expect(fixture.provider_response).toBeDefined();
    expect(fixture.expected?.recommendation).toBe('scale-down');
  });
});
