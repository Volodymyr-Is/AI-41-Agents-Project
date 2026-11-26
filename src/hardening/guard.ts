import { PLATFORM_HOBBY_LIMITS } from './config';

export interface KillSwitchStore {
  /**
   * Повертає true, якщо агент дозволений до роботи.
   * У разі недосяжності сховища або помилки має працювати за принципом fail-closed (вимкнено).
   */
  isEnabled(): Promise<boolean>;
}

export interface SpendSnapshot {
  readonly tokens: number;
  readonly costUsd: number;
  readonly requests: number;
}

export interface SpendQuotaStore {
  getSpent(): Promise<SpendSnapshot>;
  recordSpend(delta: { tokens: number; costUsd: number }): Promise<void>;
}

export interface HardeningLimits {
  readonly maxTokensPerDay: number;
  readonly maxUsdPerDay: number;
  readonly maxRequestsPerDay: number;
  readonly maxPayloadBytes?: number | undefined;
}

export interface GuardDecision {
  readonly allowed: boolean;
  readonly httpStatus: 200 | 413 | 429 | 503;
  readonly reason?: string | undefined;
  readonly code?: 'OK' | 'KILL_SWITCH_ACTIVE' | 'KILL_SWITCH_UNAVAILABLE' | 'SPEND_LIMIT_EXCEEDED' | 'PAYLOAD_TOO_LARGE' | undefined;
  readonly traceId?: string | undefined;
  readonly functionId: string;
  readonly snapshot?: SpendSnapshot | undefined;
}

export interface TracedRunLog {
  readonly timestamp: string;
  readonly functionId: string;
  readonly trace_id: string;
  readonly allowed: boolean;
  readonly httpStatus: number;
  readonly tokensUsed: number;
  readonly costUsd: number;
  readonly reason?: string | undefined;
}

/**
 * Програмний захист деплою (Production Hardening Guard).
 * Забезпечує:
 * 1. Fail-closed Kill Switch (не залежить від змінних середовища, що потребують редеплою).
 * 2. Стелю витрат на рівні застосунку (Spend Management на Hobby = N/A).
 * 3. Перевірку ліміту тіла запиту (4.5 MB).
 * 4. Двосторонню прив'язку траси (functionId -> gen_ai.agent.name, span.traceId -> trace_id).
 */
export class ProductionHardeningGuard {
  constructor(
    private readonly killSwitch: KillSwitchStore,
    private readonly quotaStore: SpendQuotaStore,
    private readonly limits: HardeningLimits
  ) {}

  async checkBeforeRun(params: {
    functionId: string;
    payloadBytes: number;
    traceId?: string | undefined;
  }): Promise<GuardDecision> {
    const maxBytes = this.limits.maxPayloadBytes ?? PLATFORM_HOBBY_LIMITS.maxPayloadBytes;

    // 1. Перевірка розміру запиту до виклику моделі
    if (params.payloadBytes > maxBytes) {
      return {
        allowed: false,
        httpStatus: 413,
        code: 'PAYLOAD_TOO_LARGE',
        reason: `Payload size (${params.payloadBytes} bytes) exceeds platform limit (${maxBytes} bytes).`,
        functionId: params.functionId,
        traceId: params.traceId,
      };
    }

    // 2. Перевірка Kill Switch (fail-closed при помилці читання)
    let isAgentEnabled = false;
    try {
      isAgentEnabled = await this.killSwitch.isEnabled();
    } catch {
      return {
        allowed: false,
        httpStatus: 503,
        code: 'KILL_SWITCH_UNAVAILABLE',
        reason: 'Kill switch store unreachable; failing closed to protect quota.',
        functionId: params.functionId,
        traceId: params.traceId,
      };
    }

    if (!isAgentEnabled) {
      return {
        allowed: false,
        httpStatus: 503,
        code: 'KILL_SWITCH_ACTIVE',
        reason: 'Agent execution is disabled by kill switch.',
        functionId: params.functionId,
        traceId: params.traceId,
      };
    }

    // 3. Перевірка стелі витрат (Spend Cap)
    const spent = await this.quotaStore.getSpent();
    if (
      spent.tokens >= this.limits.maxTokensPerDay ||
      spent.costUsd >= this.limits.maxUsdPerDay ||
      spent.requests >= this.limits.maxRequestsPerDay
    ) {
      return {
        allowed: false,
        httpStatus: 429,
        code: 'SPEND_LIMIT_EXCEEDED',
        reason: `Daily spend limit exceeded (tokens: ${spent.tokens}/${this.limits.maxTokensPerDay}, usd: ${spent.costUsd.toFixed(4)}/${this.limits.maxUsdPerDay}, requests: ${spent.requests}/${this.limits.maxRequestsPerDay}).`,
        functionId: params.functionId,
        traceId: params.traceId,
        snapshot: spent,
      };
    }

    return {
      allowed: true,
      httpStatus: 200,
      code: 'OK',
      functionId: params.functionId,
      traceId: params.traceId,
      snapshot: spent,
    };
  }

  async recordSuccess(params: {
    functionId: string;
    traceId: string;
    tokensUsed: number;
    costUsd: number;
  }): Promise<TracedRunLog> {
    await this.quotaStore.recordSpend({
      tokens: params.tokensUsed,
      costUsd: params.costUsd,
    });

    return {
      timestamp: new Date().toISOString(),
      functionId: params.functionId,
      trace_id: params.traceId,
      allowed: true,
      httpStatus: 200,
      tokensUsed: params.tokensUsed,
      costUsd: params.costUsd,
    };
  }
}

/**
 * Детерміноване тестове сховище для перевірки лімітів та Kill Switch у тестах.
 */
export class InMemoryHardeningStore implements KillSwitchStore, SpendQuotaStore {
  public enabled = true;
  public throwOnRead = false;
  private tokens = 0;
  private costUsd = 0;
  private requests = 0;

  async isEnabled(): Promise<boolean> {
    if (this.throwOnRead) {
      throw new Error('Config store connection timeout');
    }
    return this.enabled;
  }

  async getSpent(): Promise<SpendSnapshot> {
    return {
      tokens: this.tokens,
      costUsd: this.costUsd,
      requests: this.requests,
    };
  }

  async recordSpend(delta: { tokens: number; costUsd: number }): Promise<void> {
    this.tokens += delta.tokens;
    this.costUsd += delta.costUsd;
    this.requests += 1;
  }
}
