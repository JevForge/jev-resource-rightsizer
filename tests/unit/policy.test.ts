import { describe, expect, it } from 'vitest';
import { applyRightsizingPolicy } from '../../src/decision/policy.js';
import { normalizeAnswer } from '../../src/core/jev/normalize.js';
import { report, resource, policyDefaults } from '../helpers.js';

describe('policy', () => {
  it('forces review on low confidence scale-up', () => {
    const r = report([resource({ cpu: 90, memory: 85 })]);
    const decision = normalizeAnswer({ decision: 'scale-up', confidence: 0.4, provisional: false }, r);
    const outcome = applyRightsizingPolicy(decision, r, policyDefaults);
    expect(outcome.decision.recommendation).toBe('review');
    expect(outcome.decision.reason_codes).toContain('LOW_CONFIDENCE');
  });

  it('fails when low_confidence_policy is fail and provisional', () => {
    const r = report([resource({ cpu: 45 })]);
    const decision = normalizeAnswer(
      { decision: null, confidence: 0, provisional: true, unavailableMessage: 'down' },
      r,
    );
    const outcome = applyRightsizingPolicy(decision, r, policyDefaults);
    expect(outcome.status).toBe('fail');
    expect(outcome.decision.recommendation).toBe('review');
    expect(outcome.decision.provisional).toBe(true);
  });

  it('can fail on review when configured', () => {
    const r = report([resource({ cpu: 15, maxCpu: 90 })]);
    const decision = normalizeAnswer({ decision: 'review', confidence: 0.9, provisional: false }, r);
    const outcome = applyRightsizingPolicy(decision, r, { ...policyDefaults, failOnReview: true });
    expect(outcome.status).toBe('fail');
  });

  it('allows keep with high confidence', () => {
    const r = report([resource({ cpu: 45, memory: 50 })]);
    const decision = normalizeAnswer({ decision: 'keep', confidence: 0.92, provisional: false }, r);
    const outcome = applyRightsizingPolicy(decision, r, policyDefaults);
    expect(outcome.status).toBe('ok');
    expect(outcome.decision.recommendation).toBe('keep');
  });
});
