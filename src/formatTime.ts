/**
 * Форматує тривалість у мілісекундах у зручний для читання людиною рядок.
 *
 * Підтримувані формати / поведінка:
 * - Від'ємні або некоректні значення обробляються коректно (за замовчуванням 0s).
 * - До 1 хвилини: секунди (наприклад, "45s").
 * - До 1 години: хвилини і секунди (наприклад, "12m 34s", "5m").
 * - Від 1 години і більше: години, хвилини (і секунди, якщо є) (наприклад, "1h 20m", "2h 5m 30s").
 *
 * Також підтримує формат з двокрапками ("mm:ss" або "hh:mm:ss"), якщо передано відповідний параметр.
 */

export interface FormatTimeOptions {
  /**
   * Стиль форматування:
   * - 'human' (типово): '1h 20m 30s', '45s'
   * - 'digital': '01:20:30', '00:45'
   */
  style?: 'human' | 'digital';
  /** Чи показувати мілісекунди або залишати нульові секунди */
  padZeroes?: boolean;
}

export function formatTime(ms: number, options: FormatTimeOptions = {}): string {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms < 0) {
    return options.style === 'digital' ? '00:00' : '0s';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (options.style === 'digital') {
    const pad = (num: number): string => num.toString().padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  // human style
  if (totalSeconds === 0) {
    return '0s';
  }

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
