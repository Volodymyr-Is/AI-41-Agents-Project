/**
 * Константи платформи Vercel Hobby та безпечна конфігурація телеметрії (Крок 06).
 */

export const PLATFORM_HOBBY_LIMITS = {
  /** Максимальна тривалість serverless-функції на тарифі Hobby (секунди). На межі — 504 FUNCTION_INVOCATION_TIMEOUT */
  maxDurationSec: 300,
  /** Виділена пам'ять (МБ) */
  memoryMb: 2048,
  /** Кількість vCPU */
  vCpu: 1,
  /** Максимальний розмір тіла запиту або відповіді (байтів). На межі — 413 FUNCTION_PAYLOAD_TOO_LARGE */
  maxPayloadBytes: 4.5 * 1024 * 1024, // 4,718,592 байтів
  /** Типовий єдиний регіон для Hobby */
  defaultRegion: 'iad1',
  /** Зберігання журналів виконання на Hobby (години); Log Drains недоступні */
  logRetentionHours: 1,
} as const;

export interface TelemetryPrivacyOptions {
  readonly isEnabled: boolean;
  readonly recordInputs: false;
  readonly recordOutputs: false;
  readonly functionId: string;
}

/**
 * Створює безпечну конфігурацію телеметрії AI SDK 7.
 * Вимога Free Tier: recordInputs та recordOutputs ЗАВЖДИ вимкнені (false),
 * щоб персональні дані чи вміст промптів/відповідей не потрапляли в трасу.
 */
export function createSafeTelemetryConfig(functionId: string): TelemetryPrivacyOptions {
  if (!functionId || functionId.trim().length === 0) {
    throw new Error('telemetry.functionId є обов\'язковим для двосторонньої прив\'язки траси (gen_ai.agent.name)');
  }

  return {
    isEnabled: true,
    recordInputs: false,
    recordOutputs: false,
    functionId: functionId.trim(),
  };
}
