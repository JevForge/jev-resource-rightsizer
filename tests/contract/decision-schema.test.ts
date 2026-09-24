import { describe, expect, it } from 'vitest';
import { RightsizingDecisionSchema } from '../../src/schemas/decision.js';
import { answerFromEvaluateBody } from '../../src/core/jev/http-evaluate.js';
import { normalizeAnswer } from '../../src/core/jev/normalize.js';
import { report, resource } from '../helpers.js';

describe('decision contract', () => {
  it('accepts a valid rightsizing decision', () => {
    const r = report([resource({ cpu: 45 })]);
    const decision = normalizeAnswer({ decision: 'keep', confidence: 0.9, provisional: false }, r);
    expect(() => RightsizingDecisionSchema.parse(decision)).not.toThrow();
  });

  it('rejects unknown recommendation choices from evaluate body', () => {
    expect(() =>
      answerFromEvaluateBody({
        answers: { decision: { type: 'choice', choice: 'resize-now' } },
      }),
    ).toThrow(/SCHEMA_REJECTED/);
  });

  it('rejects missing decision choice', () => {
    expect(() => answerFromEvaluateBody({ answers: {} })).toThrow(/SCHEMA_REJECTED/);
  });

  it('rejects confidence outside 0..1', () => {
    const r = report([resource({ cpu: 10 })]);
    expect(() => normalizeAnswer({ decision: 'scale-down', confidence: 1.5, provisional: false }, r)).toThrow(
      /SCHEMA_REJECTED/,
    );
  });
});
