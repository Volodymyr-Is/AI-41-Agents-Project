/**
 * Formats a duration in milliseconds into a human-readable string (e.g. "1h 23m 45s", "45s", "120ms").
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted time string
 */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0ms';
  }

  const roundedMs = Math.round(ms);
  if (roundedMs === 0) {
    return '0ms';
  }

  const totalSeconds = Math.floor(roundedMs / 1000);
  const remainingMs = roundedMs % 1000;

  if (totalSeconds === 0) {
    return `${remainingMs}ms`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}
