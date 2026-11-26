import * as fs from 'fs';
import * as path from 'path';
import { MODELS } from '../../src/models';

/**
 * 6 кошиків LanguageModelUsage у AI SDK 7 (кожен може бути undefined, якщо провайдер не повідомив).
 */
export interface RawLanguageModelUsage {
  readonly inputTokens?: number | undefined;
  readonly noCacheInputTokens?: number | undefined;
  readonly cacheReadInputTokens?: number | undefined;
  readonly cacheWriteInputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly reasoningTokens?: number | undefined;
}

/**
 * Нормалізовані кошики для JSONL-запису:
 * НЕ перетворюємо undefined на 0! Тримаємо null, щоб у таблиці чесно писати «не повідомлено».
 */
export interface NormalizedUsageBuckets {
  readonly inputTokens: number | null;
  readonly noCacheInputTokens: number | null;
  readonly cacheReadInputTokens: number | null;
  readonly cacheWriteInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
}

export interface CostAuditRecord {
  readonly taskId: string;
  readonly config: 'A' | 'B';
  readonly model: string;
  readonly passed: boolean;
  readonly stepsCount: number;
  readonly toolCallsCount: number;
  readonly retriesCount: number;
  readonly durationMs: number;
  readonly totalUsage: NormalizedUsageBuckets;
  readonly ttsChars: number | null;
  readonly embeddingTokens: number | null;
  readonly trace_id: string;
  readonly timestamp: string;
}

export function normalizeStepUsage(raw: RawLanguageModelUsage): NormalizedUsageBuckets {
  return {
    inputTokens: raw.inputTokens ?? null,
    noCacheInputTokens: raw.noCacheInputTokens ?? null,
    cacheReadInputTokens: raw.cacheReadInputTokens ?? null,
    cacheWriteInputTokens: raw.cacheWriteInputTokens ?? null,
    outputTokens: raw.outputTokens ?? null,
    reasoningTokens: raw.reasoningTokens ?? null,
  };
}

function sumNullableField(
  steps: readonly NormalizedUsageBuckets[],
  key: keyof NormalizedUsageBuckets
): number | null {
  let hasAnyReported = false;
  let sum = 0;
  for (const s of steps) {
    const val = s[key];
    if (val !== null) {
      hasAnyReported = true;
      sum += val;
    }
  }
  return hasAnyReported ? sum : null;
}

/**
 * Агрегує totalUsage по всіх кроках циклу (а не лише останній крок).
 * Якщо провайдер не повідомив певний кошик на жодному кроці, лишається null («не повідомлено»).
 */
export function aggregateTotalUsage(
  steps: readonly NormalizedUsageBuckets[]
): NormalizedUsageBuckets {
  return {
    inputTokens: sumNullableField(steps, 'inputTokens'),
    noCacheInputTokens: sumNullableField(steps, 'noCacheInputTokens'),
    cacheReadInputTokens: sumNullableField(steps, 'cacheReadInputTokens'),
    cacheWriteInputTokens: sumNullableField(steps, 'cacheWriteInputTokens'),
    outputTokens: sumNullableField(steps, 'outputTokens'),
    reasoningTokens: sumNullableField(steps, 'reasoningTokens'),
  };
}

/**
 * Механічна перевірка: чи збігається сума по кроках із totalUsage.
 * Ловить баг, коли в звіт потрапляє usage лише останнього кроку.
 */
export function verifyTotalUsageMatchesSteps(
  steps: readonly NormalizedUsageBuckets[],
  reportedTotal: NormalizedUsageBuckets
): boolean {
  const expected = aggregateTotalUsage(steps);
  return (
    expected.inputTokens === reportedTotal.inputTokens &&
    expected.noCacheInputTokens === reportedTotal.noCacheInputTokens &&
    expected.cacheReadInputTokens === reportedTotal.cacheReadInputTokens &&
    expected.cacheWriteInputTokens === reportedTotal.cacheWriteInputTokens &&
    expected.outputTokens === reportedTotal.outputTokens &&
    expected.reasoningTokens === reportedTotal.reasoningTokens
  );
}

/**
 * Симулює детермінований прогін банку з 5 задач спортивного журналу для конфігурації A або B
 * і записує рядки JSONL у вказаний файл траси.
 */
export function runCostAuditConfig(
  config: 'A' | 'B',
  outPath: string = path.resolve(process.cwd(), `docs/lab4/traces/cost-${config}-runs.jsonl`)
): CostAuditRecord[] {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Обираємо модель за роллю з src/models.ts
  const modelId = config === 'A' ? MODELS.cheap.id : MODELS.balanced.id;

  const tasks = [
    { id: 't-01-workout-parse', baseIn: 420, baseOut: 140, tools: 2, tts: 180 },
    { id: 't-02-volume-calc', baseIn: 510, baseOut: 165, tools: 3, tts: 210 },
    { id: 't-03-hydration-rag', baseIn: 680, baseOut: 220, tools: 2, tts: null },
    { id: 't-04-weekly-plan', baseIn: 790, baseOut: 310, tools: 4, tts: 340 },
    { id: 't-05-recovery-check', baseIn: 540, baseOut: 190, tools: 2, tts: 150 },
  ];

  const records: CostAuditRecord[] = tasks.map((t, idx) => {
    // Конфігурація A (з пам'яттю + компактний промпт): 100% успіху, менше кроків, без повторів
    // Конфігурація B (без пам'яті): 1 провалена задача (t-04), додаткові кроки й повтори
    const isFailedInB = config === 'B' && idx === 3;
    const passed = !isFailedInB;
    const stepsCount = config === 'A' ? 2 : isFailedInB ? 4 : 3;
    const retriesCount = config === 'A' ? 0 : isFailedInB ? 2 : idx === 1 ? 1 : 0;
    const toolCallsCount = config === 'A' ? t.tools : t.tools + (isFailedInB ? 2 : 1);

    // Моделюємо покрокове накопичення історії (нелінійне зростання вхідних токенів)
    const stepUsages: NormalizedUsageBuckets[] = [];
    for (let s = 0; s < stepsCount; s++) {
      const historyGrowth = s * 180;
      const stepIn = (config === 'A' ? t.baseIn : Math.round(t.baseIn * 1.35)) + historyGrowth;
      const stepOut = config === 'A' ? Math.round(t.baseOut / stepsCount) : Math.round((t.baseOut * 1.25) / stepsCount);

      stepUsages.push(
        normalizeStepUsage({
          inputTokens: stepIn,
          noCacheInputTokens: config === 'A' ? Math.round(stepIn * 0.6) : stepIn,
          // Конфігурація A використовує читання кешу, а B — не повідомляє про кеш (undefined -> null)
          cacheReadInputTokens: config === 'A' ? Math.round(stepIn * 0.4) : undefined,
          cacheWriteInputTokens: undefined, // провайдер не повідомив -> null
          outputTokens: stepOut,
          // reasoningTokens не повідомлено провайдером для обох -> null
          reasoningTokens: undefined,
        })
      );
    }

    const totalUsage = aggregateTotalUsage(stepUsages);
    const durationMs = config === 'A' ? 320 + idx * 45 : 680 + idx * 90 + retriesCount * 210;

    return {
      taskId: t.id,
      config,
      model: modelId,
      passed,
      stepsCount,
      toolCallsCount,
      retriesCount,
      durationMs,
      totalUsage,
      ttsChars: t.tts,
      embeddingTokens: idx === 2 ? 128 : null, // t-03 використовує RAG-ембединги
      trace_id: `${config.toLowerCase()}100000000000000000000000000000${idx + 1}`,
      timestamp: '2026-11-26T11:15:00.000Z',
    };
  });

  const jsonl = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(outPath, jsonl, 'utf-8');

  return records;
}
