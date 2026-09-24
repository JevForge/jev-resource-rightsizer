import { describe, expect, it } from 'vitest';
import { runResourceRightsizer } from '../../src/run.js';
import { report, resource } from '../helpers.js';
import type { JevProvider } from '../../src/core/jev/types.js';

describe('runResourceRightsizer', () => {
  it('emits keep recommendation end-to-end with injected provider', async () => {
    const provider: JevProvider = {
      id: 'custom-compatible',
      async evaluateRightsizing() {
        return { decision: 'keep', confidence: 0.91, provisional: false };
      },
    };
    const result = await runResourceRightsizer({
      report: report([resource({ cpu: 45, memory: 50 })]),
      minConfidence: 0.75,
      lowConfidencePolicy: 'fail',
      allowPartial: false,
      allowInsufficient: false,
      failOnReview: false,
      failOnScaleUp: false,
      failOnScaleDown: false,
      jevProvider: 'custom-compatible',
      timeoutMs: 1000,
      provider,
      redactResourceNames: true,
      commentOnGithub: false,
      applyLabels: false,
      createCheckRun: false,
      dryRun: true,
    });
    expect(result.outcome.decision.recommendation).toBe('keep');
    expect(result.outcome.status).toBe('ok');
    expect(result.effects).toContain('set-outputs');
    expect(result.markdown).toContain('JEV Resource RightSizer');
    expect(result.outcome.decision.per_resource_recommendations[0]?.resource_id).toMatch(/^redacted:/);
  });

  it('never lists infrastructure-mutation effects', async () => {
    const provider: JevProvider = {
      id: 'custom-compatible',
      async evaluateRightsizing() {
        return { decision: 'scale-down', confidence: 0.95, provisional: false };
      },
    };
    const result = await runResourceRightsizer({
      report: report([resource({ cpu: 5, memory: 10 })]),
      minConfidence: 0.75,
      lowConfidencePolicy: 'warn',
      allowPartial: true,
      allowInsufficient: true,
      failOnReview: false,
      failOnScaleUp: false,
      failOnScaleDown: false,
      jevProvider: 'custom-compatible',
      timeoutMs: 1000,
      provider,
      redactResourceNames: false,
      commentOnGithub: true,
      applyLabels: true,
      createCheckRun: true,
      dryRun: true,
      headSha: 'abc',
    });
    expect(result.effects.every(effect => !effect.includes('scale') && !effect.includes('resize'))).toBe(true);
    expect(result.commentStatus).toBe('dry-run');
  });
});
