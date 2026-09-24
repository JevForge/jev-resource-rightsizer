/** Stable log / error prefix for this Action. */
export const ACTION_LOG_PREFIX = '[JEV Resource RightSizer]';

/**
 * Build a consumer-facing error message without embedding secrets.
 * Prefer actionable cause text; keep the stable prefix.
 */
export function actionError(cause: string): string {
  const cleaned = cause.replace(/^\s*\[JEV Resource RightSizer\]\s*/i, '').trim();
  return `${ACTION_LOG_PREFIX} ${cleaned}`;
}
