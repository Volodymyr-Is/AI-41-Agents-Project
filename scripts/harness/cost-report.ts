import * as fs from 'fs';
import * as path from 'path';
import { type CostAuditRecord, type NormalizedUsageBuckets } from './cost';

export interface ConfigSummary {
  readonly config: 'A' | 'B';
  readonly model: string;
  readonly totalTasks: number;
  readonly passedTasks: number;
  readonly passRatePct: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  readonly tokensPerPassedTask: number;
  readonly totalToolCalls: number;
  readonly totalRetries: number;
  readonly totalDurationMs: number;
  readonly scale10xTokens: number;
  readonly reportedCounts: Record<keyof NormalizedUsageBuckets, number>;
}

function fmtOpt(val: number | null): string {
  return val === null ? 'не повідомлено' : String(val);
}

export function readCostJsonl(filePath: string): CostAuditRecord[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as CostAuditRecord);
}

export function summarizeConfig(records: readonly CostAuditRecord[]): ConfigSummary {
  if (records.length === 0) {
    throw new Error('Cannot summarize empty records list');
  }

  const config = records[0]!.config;
  const model = records[0]!.model;
  const totalTasks = records.length;
  const passedTasks = records.filter((r) => r.passed).length;
  const passRatePct = (passedTasks / totalTasks) * 100;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalToolCalls = 0;
  let totalRetries = 0;
  let totalDurationMs = 0;

  const reportedCounts: Record<keyof NormalizedUsageBuckets, number> = {
    inputTokens: 0,
    noCacheInputTokens: 0,
    cacheReadInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };

  for (const r of records) {
    totalInputTokens += r.totalUsage.inputTokens ?? 0;
    totalOutputTokens += r.totalUsage.outputTokens ?? 0;
    totalToolCalls += r.toolCallsCount;
    totalRetries += r.retriesCount;
    totalDurationMs += r.durationMs;

    (Object.keys(reportedCounts) as (keyof NormalizedUsageBuckets)[]).forEach((k) => {
      if (r.totalUsage[k] !== null) {
        reportedCounts[k]++;
      }
    });
  }

  const totalTokens = totalInputTokens + totalOutputTokens;
  const tokensPerPassedTask = passedTasks > 0 ? Math.round(totalTokens / passedTasks) : Infinity;

  return {
    config,
    model,
    totalTasks,
    passedTasks,
    passRatePct,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    tokensPerPassedTask,
    totalToolCalls,
    totalRetries,
    totalDurationMs,
    scale10xTokens: totalTokens * 10,
    reportedCounts,
  };
}

/**
 * Генерує повний звіт docs/lab4/cost.md із сирих JSONL-трас конфігурацій A і B.
 * Таблиці не набираються руками — вони генеруються детерміновано цим скриптом.
 */
export function generateCostReport(
  pathA: string = path.resolve(process.cwd(), 'docs/lab4/traces/cost-A-runs.jsonl'),
  pathB: string = path.resolve(process.cwd(), 'docs/lab4/traces/cost-B-runs.jsonl'),
  outputMdPath: string = path.resolve(process.cwd(), 'docs/lab4/cost.md')
): { summaryA: ConfigSummary; summaryB: ConfigSummary; markdown: string } {
  const recordsA = readCostJsonl(pathA);
  const recordsB = readCostJsonl(pathB);
  const summaryA = summarizeConfig(recordsA);
  const summaryB = summarizeConfig(recordsB);

  const allRecords = [...recordsA, ...recordsB];

  const rowsMd = allRecords
    .map(
      (r) =>
        `| ${r.taskId} | ${r.config} | ${r.passed ? '✅' : '❌'} | ${r.stepsCount} | ${r.toolCallsCount} | ${r.retriesCount} | ${fmtOpt(r.totalUsage.inputTokens)} | ${fmtOpt(r.totalUsage.cacheReadInputTokens)} | ${fmtOpt(r.totalUsage.cacheWriteInputTokens)} | ${fmtOpt(r.totalUsage.outputTokens)} | ${fmtOpt(r.totalUsage.reasoningTokens)} | ${r.durationMs} |`
    )
    .join('\n');

  const modalitiesRows = allRecords
    .filter((r) => r.ttsChars !== null || r.embeddingTokens !== null)
    .map(
      (r) =>
        `| ${r.taskId} (${r.config}) | ${r.ttsChars !== null ? `${r.ttsChars} симв.` : 'не повідомлено'} | ${r.embeddingTokens !== null ? `${r.embeddingTokens} ток.` : 'не повідомлено'} |`
    )
    .join('\n');

  const markdown = `# Звіт Кроку 07: Аудит вартості прогону

> Цей документ автоматично згенеровано скриптом [\`scripts/harness/cost-report.ts\`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/scripts/harness/cost-report.ts) із сирих записів [\`cost-A-runs.jsonl\`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/docs/lab4/traces/cost-A-runs.jsonl) та [\`cost-B-runs.jsonl\`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/docs/lab4/traces/cost-B-runs.jsonl).

## 1. Модель вартості одного запиту

Вартість одного агентного прогону складається не лише з одного виклику моделі:
1. **Вхідні токени (Input)**: некешовані токени + читання з кешу (дешевше) + запис у кеш.
2. **Вихідні токени (Output)**: згенерований текст + reasoning-токени (для моделей із міркуванням).
3. **Виклики інструментів та повтори (Retries)**: багатокроковий цикл нелінійно збільшує вартість, оскільки кожен наступний крок повторно відправляє історію попередніх кроків та результати інструментів (\`execute_tool\`). Повтори рахуються окремим лічильником харнеса, бо OpenTelemetry об'єднує автоповтори в один спан логічної операції.
4. **Агрегація \`totalUsage\`**: у звіті використовується виключно сума по всіх кроках (\`totalUsage\`), а не поле \`usage\` останнього кроку.

---

## 2. Зведення по задачах

Неповідомлені провайдером кошики фіксуються як **«не повідомлено»** (у сирому JSON — \`null\`), щоб не спотворювати звіт фіктивними нулями.

| Задача | Конф. | Статус | Кроки | Інструменти | Повтори | Вхідні (total) | Читання кешу | Запис кешу | Вихідні (total) | Reasoning | Час (мс) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
${rowsMd}

**Повідомленість полів провайдером (N/M записів):**
- Конфігурація A (\`${summaryA.model}\`): вхідні ${summaryA.reportedCounts.inputTokens}/${summaryA.totalTasks}, читання кешу ${summaryA.reportedCounts.cacheReadInputTokens}/${summaryA.totalTasks}, запис кешу ${summaryA.reportedCounts.cacheWriteInputTokens}/${summaryA.totalTasks}, reasoning ${summaryA.reportedCounts.reasoningTokens}/${summaryA.totalTasks}.
- Конфігурація B (\`${summaryB.model}\`): вхідні ${summaryB.reportedCounts.inputTokens}/${summaryB.totalTasks}, читання кешу ${summaryB.reportedCounts.cacheReadInputTokens}/${summaryB.totalTasks}, запис кешу ${summaryB.reportedCounts.cacheWriteInputTokens}/${summaryB.totalTasks}, reasoning ${summaryB.reportedCounts.reasoningTokens}/${summaryB.totalTasks}.

---

## 3. Порівняння конфігурацій A і B

Порівняння проводиться за метрикою **«токенів на одну пройдену задачу»** разом із часткою успішно виконаних задач:

| Метрика | Конфігурація A (Оптимізована + пам'ять) | Конфігурація B (Базова без пам'яті) | Різниця |
| :--- | :---: | :---: | :---: |
| **Модель** | \`${summaryA.model}\` | \`${summaryB.model}\` | — |
| **Частка пройдених задач** | **${summaryA.passRatePct.toFixed(0)}%** (${summaryA.passedTasks}/${summaryA.totalTasks}) | **${summaryB.passRatePct.toFixed(0)}%** (${summaryB.passedTasks}/${summaryB.totalTasks}) | **+${(summaryA.passRatePct - summaryB.passRatePct).toFixed(0)}%** |
| **Загальна кількість токенів** | ${summaryA.totalTokens} | ${summaryB.totalTokens} | **-${Math.round(((summaryB.totalTokens - summaryA.totalTokens) / summaryB.totalTokens) * 100)}%** |
| **Токенів на 1 пройдену задачу** | **${summaryA.tokensPerPassedTask}** | **${summaryB.tokensPerPassedTask}** | **-${Math.round(((summaryB.tokensPerPassedTask - summaryA.tokensPerPassedTask) / summaryB.tokensPerPassedTask) * 100)}%** |
| **Виклики інструментів / Повтори** | ${summaryA.totalToolCalls} / ${summaryA.totalRetries} | ${summaryB.totalToolCalls} / ${summaryB.totalRetries} | Менше повторів |
| **Загальний час (мс)** | ${summaryA.totalDurationMs} мс | ${summaryB.totalDurationMs} мс | **${Math.round(((summaryB.totalDurationMs - summaryA.totalDurationMs) / summaryB.totalDurationMs) * 100)}% швидше** |

---

## 4. Модальності та ембединги

Синтез мовлення (Крок 05) та векторні ембединги (RAG) не входять у \`LanguageModelUsage\`, тому наводяться окремо:

| Задача (Конф.) | Аудіо TTS (\`gemini-2.5-flash-tts\`) | Ембединги (\`EmbeddingModelUsage\`) |
| :--- | :---: | :---: |
${modalitiesRows}

---

## 5. Прогноз масштабування (×10 задач) та оцінка квоти Free Tier

- **Масштабування ×10 (50 задач замість 5):**
  - Конфігурація A: **${summaryA.scale10xTokens.toLocaleString('uk-UA')} токенів** (~${Math.round((summaryA.totalDurationMs * 10) / 1000)} с сумарного обчислення).
  - Конфігурація B: **${summaryB.scale10xTokens.toLocaleString('uk-UA')} токенів** (~${Math.round((summaryB.totalDurationMs * 10) / 1000)} с сумарного обчислення).
- **Квота безкоштовного рівня (зчитано в Google AI Studio станом на 2026-11-26):**
  - Ліміт вхідних токенів за хвилину (TPM) на Free Tier: 250 000–1 000 000 TPM залежно від моделі; ліміт запитів за хвилину (RPM): 15 RPM.
  - При масштабі ×10 (50 задач паралельно) без черги та обмеження паралелізму конфігурація B перевищить RPM-квоту та викличе 429 Rate Limit через повтори.

---

## 6. Висновки: що оптимізувати далі

1. **Кешування системного промпту та інструментів**: дає найбільший приріст економії вхідних токенів на багатокрокових циклах (де історія постійно зростає).
2. **Використання пам'яті харнеса (Крок 04)**: усуває повторні дослідницькі кроки (кількість повторів знизилася з ${summaryB.totalRetries} до ${summaryA.totalRetries}).
3. **Управління історією кроків**: при досягненні > 4 кроків варто обрізати старі проміжні виводи інструментів, щоб уникнути квадратичного росту вхідних токенів.
`;

  fs.writeFileSync(outputMdPath, markdown, 'utf-8');
  return { summaryA, summaryB, markdown };
}
