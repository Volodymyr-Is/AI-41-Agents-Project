/**
 * Вимір паралельності та оцінка графа виконання (Лабораторна 2, Крок 07).
 * ХОДИТЬ У МЕРЕЖУ — запускається вручну:
 *
 *   npx tsx --env-file=.env.local scripts/parallel-eval.ts 1    «до»: послідовно (ширина 1)
 *   npx tsx --env-file=.env.local scripts/parallel-eval.ts 4    «після»: паралельно (ширина 4)
 *
 * Паралелиться ЧИТАННЯ (запити набору до готового індексу).
 * Запис однопотоковий: усі гілки повертають результат у пам'ять,
 * а головний потік зберігає підсумок у `docs/lab2/parallel-run.json`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { askRagAssistant, HybridIndex } from '../src/rag';
import type { Entry } from './validate-golden';

/** БЮДЖЕТ. Записується ДО запуску і дослівно переноситься в budget.md. */
export interface Budget {
  /** Максимум гілок, що виконуються одночасно. */
  readonly maxBranches: number;
  /** Стеля токенів на весь прогін: нова гілка не стартує, коли її перетнуто. */
  readonly maxTokens: number;
  /** Стеля часу стіни на весь прогін, мс. */
  readonly maxWallMs: number;
}

export const BUDGET: Budget = {
  maxBranches: 4,
  maxTokens: 200_000,
  maxWallMs: 10 * 60_000, // 10 хвилин
};

export interface BranchResult {
  readonly id: string;
  readonly query: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly ms: number;
  readonly answerSnippet: string;
  readonly citedDocs: string[];
}

/**
 * Пул фіксованої ширини без сторонніх бібліотек.
 * Кожна гілка самостійно перехоплює помилки, зберігаючи облік і результати успішних гілок.
 */
export async function runPool<T>(
  tasks: readonly (() => Promise<T>)[],
  budget: Budget,
  spentTokens: () => number,
): Promise<{ results: (T | Error)[]; stoppedEarly: boolean }> {
  const results: (T | Error)[] = new Array(tasks.length);
  const startedAt = performance.now();
  let next = 0;
  let stoppedEarly = false;

  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      // ПРАВИЛО ЗУПИНКИ: перевіряється перед стартом нової гілки
      if (spentTokens() >= budget.maxTokens || performance.now() - startedAt >= budget.maxWallMs) {
        stoppedEarly = true;
        return;
      }
      const i = next++;
      try {
        results[i] = await tasks[i]!();
      } catch (error) {
        results[i] = error instanceof Error ? error : new Error(String(error));
      }
    }
  };

  const width = Math.max(1, Math.min(budget.maxBranches, tasks.length));
  await Promise.all(Array.from({ length: width }, worker));
  return { results, stoppedEarly };
}

const OUT = 'docs/lab2/parallel-run.json';

async function main() {
  const widthArg = Number(process.argv[2] ?? 1);
  const width = Number.isFinite(widthArg) && widthArg > 0 ? widthArg : 1;
  const provider = (process.argv[3] ?? 'openrouter') as 'openrouter' | 'gemini' | 'ollama';
  const queriesFile = process.argv[4] ?? 'docs/lab2/golden/queries.jsonl';

  const budget: Budget = { ...BUDGET, maxBranches: width };

  console.log(`=== Вимір паралельності виконання субагентів (Крок 07) ===`);
  console.log(`Ширина пулу (maxBranches): ${budget.maxBranches}`);
  console.log(`Провайдер: ${provider}`);
  console.log(`Файл запитів: ${queriesFile}`);
  console.log(`Стеля токенів: ${budget.maxTokens.toLocaleString()} | Стеля часу: ${budget.maxWallMs / 1000} с\n`);

  // 1. Побудова індексу (виконується ДО паралельного пулу запитів — залежність графа)
  const dataDir = path.resolve(process.cwd(), 'docs/lab2/data');
  const index = new HybridIndex();
  index.loadFromDirectory(dataDir);
  const stats = index.getStats();
  console.log(`Індекс завантажено: ${stats.chunkCount} чанків, словник ${stats.vocabularySize} слів.\n`);

  // 2. Читання еталонного набору
  const entries: Entry[] = readFileSync(queriesFile, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Entry);

  console.log(`Завантажено запитів: ${entries.length}. Запуск пулу...`);

  let spent = 0;

  // 3. Формування задач для пулу
  const tasks = entries.map((entry) => async (): Promise<BranchResult> => {
    const start = performance.now();
    const resp = await askRagAssistant(entry.query, index, { provider });
    const inTokens = resp.tokens?.input ?? 0;
    const outTokens = resp.tokens?.output ?? 0;
    spent += inTokens + outTokens;

    return {
      id: entry.id,
      query: entry.query,
      inputTokens: inTokens,
      outputTokens: outTokens,
      ms: Math.round(performance.now() - start),
      answerSnippet: resp.answer.slice(0, 70).replace(/\n/g, ' ') + '...',
      citedDocs: resp.citedDocs,
    };
  });

  // 4. Вимір часу стіни навколо пулу
  const wallStart = performance.now();
  const { results, stoppedEarly } = await runPool(tasks, budget, () => spent);
  const wallMs = Math.round(performance.now() - wallStart);

  const ok = results.filter((r): r is BranchResult => !(r instanceof Error));
  const failed = results.filter((r): r is Error => r instanceof Error);
  const sumBranchMs = ok.reduce((acc, r) => acc + r.ms, 0);

  // 5. Однопотоковий запис артефакту
  const outPath = path.resolve(process.cwd(), OUT);
  mkdirSync(path.dirname(outPath), { recursive: true });

  const runArtifact = {
    runAt: new Date().toISOString(),
    provider,
    budget,
    wallMs,
    sumBranchMs,
    speedup: sumBranchMs > 0 ? Number((sumBranchMs / wallMs).toFixed(2)) : 1,
    inputTokens: ok.reduce((acc, r) => acc + r.inputTokens, 0),
    outputTokens: ok.reduce((acc, r) => acc + r.outputTokens, 0),
    done: ok.length,
    failed: failed.map((e) => e.message),
    stoppedEarly,
    branches: ok,
  };

  writeFileSync(outPath, `${JSON.stringify(runArtifact, null, 2)}\n`, 'utf8');

  console.log('\n========================================');
  console.log(`📊 Результат вимірювання (ширина = ${budget.maxBranches}):`);
  console.log(`⏱️ Час стіни (wallMs): ${(wallMs / 1000).toFixed(2)} с (${wallMs} мс)`);
  console.log(`⏱️ Сума часу гілок (sumBranchMs): ${(sumBranchMs / 1000).toFixed(2)} с (${sumBranchMs} мс)`);
  console.log(`⚡ Ефективний коефіцієнт прискорення: ${runArtifact.speedup}x`);
  console.log(`🔢 Токени (In / Out): ${runArtifact.inputTokens} / ${runArtifact.outputTokens}`);
  console.log(`✅ Виконано: ${ok.length}/${entries.length} (помилок: ${failed.length})`);
  console.log(`🛑 Зупинено за бюджетом: ${stoppedEarly ? 'ТАК' : 'НІ'}`);
  console.log(`💾 Артефакт збережено в: ${OUT}`);
  console.log('========================================');
}

if (process.argv[1]?.endsWith('parallel-eval.ts')) {
  main().catch((err) => {
    console.error('Помилка виконання parallel-eval:', err);
    process.exit(1);
  });
}
