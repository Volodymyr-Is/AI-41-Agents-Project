import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerData {
  state: BreakerState;
  fails: number;
  consecutiveFails: number;
  openedAt: string | null;
  trip: string | null;
  history: Array<{
    timestamp: string;
    event: 'trip' | 'probe_pass' | 'probe_fail' | 'fail' | 'pass';
    details: string;
  }>;
}

export const DEFAULT_BREAKER_FILE = '.harness/breaker.json';
export const DEFAULT_THRESHOLD = 3; // 3 відмови підряд
export const DEFAULT_COOLDOWN_MIN = 30; // 30 хвилин перепочинку

export class CircuitBreaker {
  private filePath: string;
  private threshold: number;
  private cooldownMin: number;

  constructor(options?: { filePath?: string; threshold?: number; cooldownMin?: number }) {
    this.filePath = options?.filePath ?? DEFAULT_BREAKER_FILE;
    this.threshold = options?.threshold ?? DEFAULT_THRESHOLD;
    this.cooldownMin = options?.cooldownMin ?? DEFAULT_COOLDOWN_MIN;
  }

  public load(): BreakerData {
    if (!existsSync(this.filePath)) {
      return {
        state: 'closed',
        fails: 0,
        consecutiveFails: 0,
        openedAt: null,
        trip: null,
        history: [],
      };
    }
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as BreakerData;
    } catch {
      return {
        state: 'closed',
        fails: 0,
        consecutiveFails: 0,
        openedAt: null,
        trip: null,
        history: [],
      };
    }
  }

  public save(data: BreakerData): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  /**
   * Перевіряє, чи дозволено взяти наступну задачу з черги.
   */
  public mayRun(): { allow: boolean; probe: boolean; why: string; state: BreakerState } {
    const b = this.load();

    if (b.state === 'closed') {
      return { allow: true, probe: false, why: 'closed: штатний режим', state: 'closed' };
    }

    if (b.state === 'open') {
      if (!b.openedAt) {
        return { allow: false, probe: false, why: `open: ${b.trip ?? 'аварія'}`, state: 'open' };
      }
      const waitedMin = (Date.now() - Date.parse(b.openedAt)) / 60000;
      if (waitedMin < this.cooldownMin) {
        return {
          allow: false,
          probe: false,
          why: `open: триває перепочинок (${waitedMin.toFixed(1)}/${this.cooldownMin} хв). Причина: ${b.trip}`,
          state: 'open',
        };
      }

      // Час перепочинку сплив -> перехід у half-open для рівно однієї пробної задачі
      const updated: BreakerData = {
        ...b,
        state: 'half-open',
        history: [
          ...b.history,
          {
            timestamp: new Date().toISOString(),
            event: 'probe_pass',
            details: 'Перехід у half-open: дозволено одну пробну задачу',
          },
        ],
      };
      this.save(updated);
      return {
        allow: true,
        probe: true,
        why: 'half-open: дозволено рівно одну пробну задачу',
        state: 'half-open',
      };
    }

    // Якщо стан уже half-open, повторні задачі до завершення проби блокуються
    return {
      allow: false,
      probe: false,
      why: 'half-open: очікується результат поточної пробної задачі',
      state: 'half-open',
    };
  }

  /**
   * Фіксує результат виконання задачі й оновлює стан автомата.
   */
  public recordResult(options: {
    ok: boolean;
    tripReason?: string;
    isRateLimit429?: boolean;
    budgetExceeded?: boolean;
    noProgress?: boolean;
  }): BreakerData {
    const b = this.load();
    const now = new Date().toISOString();

    if (options.ok) {
      const updated: BreakerData = {
        state: 'closed',
        fails: 0,
        consecutiveFails: 0,
        openedAt: null,
        trip: null,
        history: [
          ...b.history,
          {
            timestamp: now,
            event: b.state === 'half-open' ? 'probe_pass' : 'pass',
            details: 'Успішне виконання: стан closed',
          },
        ],
      };
      this.save(updated);
      return updated;
    }

    // Невдале виконання
    const fails = b.fails + 1;
    const consecutiveFails = b.consecutiveFails + 1;

    let shouldOpen = false;
    let trip = options.tripReason ?? 'Невідома помилка';

    if (b.state === 'half-open') {
      shouldOpen = true;
      trip = `Пробна задача у half-open впала: ${trip}`;
    } else if (options.isRateLimit429) {
      shouldOpen = true;
      trip = 'HTTP 429: вичерпано квоту провайдера (Rate Limit)';
    } else if (options.budgetExceeded) {
      shouldOpen = true;
      trip = `Перевищено ліміт бюджету задачі: ${trip}`;
    } else if (options.noProgress) {
      shouldOpen = true;
      trip = `Відсутній прогрес протягом серії задач: ${trip}`;
    } else if (consecutiveFails >= this.threshold) {
      shouldOpen = true;
      trip = `${consecutiveFails} однакових відмов підряд (поріг: ${this.threshold})`;
    }

    const updated: BreakerData = {
      state: shouldOpen ? 'open' : 'closed',
      fails,
      consecutiveFails,
      openedAt: shouldOpen ? now : b.openedAt,
      trip: shouldOpen ? trip : b.trip,
      history: [
        ...b.history,
        {
          timestamp: now,
          event: shouldOpen ? 'trip' : 'fail',
          details: shouldOpen ? `Circuit breaker OPEN: ${trip}` : `Помилка (${consecutiveFails}/${this.threshold}): ${trip}`,
        },
      ],
    };

    this.save(updated);
    return updated;
  }

  public reset(): void {
    this.save({
      state: 'closed',
      fails: 0,
      consecutiveFails: 0,
      openedAt: null,
      trip: null,
      history: [
        {
          timestamp: new Date().toISOString(),
          event: 'pass',
          details: 'Ручне скидання circuit breaker у closed',
        },
      ],
    });
  }
}

// Синглтон для стандартного використання
export const defaultBreaker = new CircuitBreaker();
export const mayRun = () => defaultBreaker.mayRun();
export const recordResult = (opts: Parameters<CircuitBreaker['recordResult']>[0]) => defaultBreaker.recordResult(opts);

