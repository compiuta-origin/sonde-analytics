export const DEFAULT_STALE_LOCK_TIMEOUT_MINUTES = 30;

export function getStaleLockTimeoutMinutes(
  defaultMinutes = DEFAULT_STALE_LOCK_TIMEOUT_MINUTES,
): number {
  const configured = Number(Deno.env.get('PROMPT_STALE_LOCK_TIMEOUT_MINUTES'));
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return defaultMinutes;
}
