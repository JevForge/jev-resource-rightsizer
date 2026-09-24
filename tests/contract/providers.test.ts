import { describe, expect, it } from 'vitest';
import { createJevProvider } from '../../src/core/jev/factory.js';
import { buildEvaluationState } from '../../src/core/jev/questions.js';
import { report, resource } from '../helpers.js';

describe('providers', () => {
  it('does not silently fall back when gateway key is missing', async () => {
    const provider = createJevProvider({
      provider: 'vercel-ai-gateway',
      timeoutMs: 1000,
    });
    const answer = await provider.evaluateRightsizing(buildEvaluationState(report([resource({ cpu: 40 })])));
    expect(answer.provisional).toBe(true);
    expect(answer.unavailableMessage).toMatch(/AI_GATEWAY_API_KEY/);
  });

  it('requires https endpoint for custom-compatible', async () => {
    const provider = createJevProvider({
      provider: 'custom-compatible',
      apiKey: 'key',
      endpoint: 'http://example.com/evaluate',
      model: 'typesafe-ai/jev',
      timeoutMs: 1000,
    });
    const answer = await provider.evaluateRightsizing(buildEvaluationState(report([resource({ cpu: 40 })])));
    expect(answer.provisional).toBe(true);
    expect(answer.unavailableMessage).toMatch(/HTTPS/);
  });

  it('posts evaluate for typesafe-native', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          answers: {
            decision: { type: 'choice', choice: 'keep', confidence: 0.88 },
            estimates_incomplete: { type: 'boolean', probability: 0.1 },
          },
        }),
        { status: 200 },
      );
    const provider = createJevProvider({
      provider: 'typesafe-native',
      apiKey: 'key',
      endpoint: 'https://example.com/evaluate',
      model: 'typesafe-ai/jev',
      timeoutMs: 1000,
      fetchImpl,
    });
    const answer = await provider.evaluateRightsizing(buildEvaluationState(report([resource({ cpu: 40 })])));
    expect(answer.decision).toBe('keep');
    expect(answer.confidence).toBeCloseTo(0.88);
    expect(answer.provisional).toBe(false);
  });
});
