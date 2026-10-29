import { hasToolCall, isStepCount } from 'ai';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const DEFAULT_STOP_LOG = 'docs/lab3/stop-log.jsonl';

export interface StopLogEntry {
  at: string;
  taskId: string;
  limit: 'isStepCount' | 'hasToolCall' | 'maxBudgetUsd' | 'timeout' | 'circuitBreaker';
  detail: string | number;
  info?: Record<string, unknown>;
}

export function logStopEvent(entry: StopLogEntry, logFile: string = DEFAULT_STOP_LOG): void {
  mkdirSync(dirname(logFile), { recursive: true });
  appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
}

/**
 * Обгортка робить те саме, що isStepCount(n), але гарантовано фіксує зупинку в журналі stop-log.jsonl.
 * Тип повернення відповідає внутрішньому помічнику з ai SDK.
 */
export function stepLimit(n: number, taskId: string, logFile: string = DEFAULT_STOP_LOG) {
  const inner = isStepCount(n);
  const wrapped: typeof inner = (...args) => {
    const r = inner(...args);
    Promise.resolve(r).then((hit) => {
      if (!hit) return;
      logStopEvent(
        {
          at: new Date().toISOString(),
          taskId,
          limit: 'isStepCount',
          detail: n,
          info: { reason: `Досягнуто ліміту агентних кроків: ${n}` },
        },
        logFile
      );
    });
    return r;
  };
  return wrapped;
}

/**
 * Обгортка над hasToolCall, що зупиняє цикл при виклику фінального інструмента та записує подію в журнал.
 */
export function toolLimit(toolName: string, taskId: string, logFile: string = DEFAULT_STOP_LOG) {
  const inner = hasToolCall(toolName);
  const wrapped: typeof inner = (...args) => {
    const r = inner(...args);
    Promise.resolve(r).then((hit) => {
      if (!hit) return;
      logStopEvent(
        {
          at: new Date().toISOString(),
          taskId,
          limit: 'hasToolCall',
          detail: toolName,
          info: { reason: `Викликано фінальний інструмент: ${toolName}` },
        },
        logFile
      );
    });
    return r;
  };
  return wrapped;
}

/**
 * Обмежувач бюджету (maxBudgetUsd): перевіряє оцінку вартості та зупиняє прогін.
 */
export function budgetLimit(
  maxUsd: number,
  getCurrentCost: () => number,
  taskId: string,
  logFile: string = DEFAULT_STOP_LOG
) {
  return () => {
    const current = getCurrentCost();
    const exceeded = current >= maxUsd;
    if (exceeded) {
      logStopEvent(
        {
          at: new Date().toISOString(),
          taskId,
          limit: 'maxBudgetUsd',
          detail: maxUsd,
          info: { currentCost: current, maxUsd, reason: `Перевищено ліміт вартості ($${current.toFixed(4)} >= $${maxUsd})` },
        },
        logFile
      );
    }
    return exceeded;
  };
}

