import { describe, expect, it } from 'vitest';
import { ACTION_LOG_PREFIX, actionError } from '../../src/utils/errors.js';

describe('actionError', () => {
  it('prefixes actionable messages', () => {
    expect(actionError('Azure Monitor HTTP 403. Verify scope.')).toBe(
      `${ACTION_LOG_PREFIX} Azure Monitor HTTP 403. Verify scope.`,
    );
  });

  it('does not double-prefix', () => {
    expect(actionError(`${ACTION_LOG_PREFIX} already prefixed`)).toBe(
      `${ACTION_LOG_PREFIX} already prefixed`,
    );
  });
});
