import type { JevProvider, JevProviderOptions, JevRawAnswer, RightsizingEvaluationState } from './types.js';
import { postEvaluate } from './http-evaluate.js';
import { buildRightsizingQuestions } from './questions.js';

export function createCustomCompatibleProvider(options: JevProviderOptions): JevProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    id: 'custom-compatible',
    async evaluateRightsizing(state: RightsizingEvaluationState): Promise<JevRawAnswer> {
      if (!options.apiKey) {
        return {
          decision: null,
          confidence: 0,
          provisional: true,
          unavailableMessage: 'JEV_CUSTOM_API_KEY is required for custom-compatible',
        };
      }
      if (!options.endpoint) {
        return {
          decision: null,
          confidence: 0,
          provisional: true,
          unavailableMessage: 'jev_endpoint is required for custom-compatible',
        };
      }
      if (!options.endpoint.startsWith('https://')) {
        return {
          decision: null,
          confidence: 0,
          provisional: true,
          unavailableMessage: 'jev_endpoint must be HTTPS for custom-compatible',
        };
      }
      if (!options.model) {
        return {
          decision: null,
          confidence: 0,
          provisional: true,
          unavailableMessage: 'jev_model is required for custom-compatible',
        };
      }
      return postEvaluate({
        endpoint: options.endpoint,
        apiKey: options.apiKey,
        model: options.model,
        state,
        questions: buildRightsizingQuestions(),
        timeoutMs: options.timeoutMs,
        fetchImpl,
        providerLabel: 'custom-compatible',
      });
    },
  };
}
