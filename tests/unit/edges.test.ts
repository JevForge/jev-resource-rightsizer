import { describe, expect, it } from 'vitest';
import { summarizeValues, percentile } from '../../src/utils/stats.js';
import { redactSecrets, resolveInside } from '../../src/utils/sanitize.js';
import { desiredLabels, isManagedLabel } from '../../src/executors/github-status.js';
import { effectsFor } from '../../src/executors/effects.js';
import { report, resource } from '../helpers.js';
import { normalizeAnswer } from '../../src/core/jev/normalize.js';

describe('utils and executors', () => {
  it('computes percentiles', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5);
    expect(summarizeValues([10, 20, 30]).avg).toBeCloseTo(20);
  });

  it('redacts secrets and blocks path escape', () => {
    expect(redactSecrets('token ghp_abcdefghijklmnopqrstuvwxyz12')).toContain('[REDACTED]');
    expect(() => resolveInside(process.cwd(), '../outside.json')).toThrow(/escapes workspace/);
  });

  it('manages rightsizing labels and effects', () => {
    const decision = normalizeAnswer(
      { decision: 'review', confidence: 0.8, provisional: false },
      report([resource({ cpu: 15, maxCpu: 90 })]),
    );
    expect(desiredLabels(decision)).toContain('jev:rightsizing:recommendation:review');
    expect(isManagedLabel('jev:rightsizing:review')).toBe(true);
    expect(
      effectsFor({ status: 'fail', decision, message: 'x' }, { comment: true, checkRun: true, labels: true }),
    ).toContain('fail-workflow');
  });
});
