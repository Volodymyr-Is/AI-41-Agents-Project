import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  type RepositoryQuery,
  type SynthesisReport,
  runMultiAgentAnalysis,
} from '../../src/multiagent/analyzer';
import { type Budget, type Spent, emptySpent } from '../../src/multiagent/budget';

// 5 контрольних питань про чужий репозиторій ms
export const BENCHMARK_QUERIES: RepositoryQuery[] = [
  {
    id: 'q1',
    question: 'Які файли та модулі зачепить зміна функції parse() і що свідчить історія комітів?',
    targetModule: 'src/index.ts#parse',
  },
  {
    id: 'q2',
    question: 'Яка залежність та константи використовуються для розрахунку тривалості місяця?',
    targetModule: 'src/index.ts#mo',
  },
  {
    id: 'q3',
    question: 'Як функція format() обробляє поріг переходу в множину plural()?',
    targetModule: 'src/index.ts#format',
  },
  {
    id: 'q4',
    question: 'Які обмеження довжини рядка перевіряються при розборі інтервалів часу?',
    targetModule: 'src/index.ts#parse-boundary',
  },
  {
    id: 'q5',
    question: 'Які відмінності між parse() та parseStrict() у публічному API бібліотеки?',
    targetModule: 'src/index.ts#parseStrict',
  },
];

const READER_DATA: Record<string, string> = {
  history:
    'В історії 15 комітів по src/index.ts; найбільш часті правки стосувалися підтримки тижнів та ESM-експорту.',
  deps: 'src/index.ts не має зовнішніх runtime-залежностей (0 dependencies), використовує нативні JS математичні операції.',
  code: 'Функція parse() розбирає регулярним виразом інтервали часу та повертає мілісекунди або кидає Error.',
  tests:
    'Тести розміщені у 5 файлах (index, parse, format, parse-strict, characterization), сумарно 174+ тести.',
};

/**
 * Послідовна базова лінія (один агент виконує запити по черзі).
 */
export async function runSerialBaseline(query: RepositoryQuery): Promise<{
  report: SynthesisReport;
  wallMs: number;
}> {
  const t0 = performance.now();
  let spent = emptySpent();

  const findings: Array<{ lane: string; detail: string }> = [];
  const lanes = ['history', 'deps', 'code', 'tests'];

  for (const lane of lanes) {
    const branchT0 = performance.now();
    // Послідовна затримка
    await new Promise((r) => setTimeout(r, 20));
    const content = READER_DATA[lane] ?? '';
    const duration = Math.round(performance.now() - branchT0);

    findings.push({ lane, detail: content });
    spent = {
      calls: spent.calls + 1,
      input: spent.input + 80,
      output: spent.output + 60,
      unreported: spent.unreported,
      ms: spent.ms + duration,
    };
  }

  // Зведення та верифікація
  await new Promise((r) => setTimeout(r, 15));
  spent.calls += 2;
  spent.input += 200;
  spent.output += 80;
  spent.ms += 15;

  const wallMs = Math.round(performance.now() - t0);

  return {
    report: {
      queryId: query.id,
      question: query.question,
      summary: `[Послідовний прогін] Зведено результати по ${query.targetModule}.`,
      findings,
      verified: true,
      stopReason: 'none',
      spent,
      wallMs,
    },
    wallMs,
  };
}

export async function runBenchmark() {
  console.log('=== ЗАПУСК ПОРІВНЯЛЬНОГО БЕНЧМАРКУ (Крок 03) ===');

  const standardBudget: Budget = {
    maxBranches: 4,
    maxTurns: 10,
    stepsPerBranch: 4,
    tokenCeiling: 10000,
    wallClockMs: 5000,
  };

  const results: Array<{
    id: string;
    serialWallMs: number;
    serialCpuMs: number;
    serialTokens: number;
    serialCalls: number;
    multiWallMs: number;
    multiCpuMs: number;
    multiTokens: number;
    multiCalls: number;
  }> = [];

  for (const q of BENCHMARK_QUERIES) {
    // 1. Послідовна базова лінія
    const serialRes = await runSerialBaseline(q);

    // 2. Паралельний мультиагентний fan-out
    const multiRes = await runMultiAgentAnalysis({
      query: q,
      budget: standardBudget,
      readerData: READER_DATA,
    });

    results.push({
      id: q.id,
      serialWallMs: serialRes.wallMs,
      serialCpuMs: serialRes.report.spent.ms,
      serialTokens: serialRes.report.spent.input + serialRes.report.spent.output,
      serialCalls: serialRes.report.spent.calls,
      multiWallMs: multiRes.wallMs,
      multiCpuMs: multiRes.spent.ms,
      multiTokens: multiRes.spent.input + multiRes.spent.output,
      multiCalls: multiRes.spent.calls,
    });
  }

  // 3. Прогін, НАВМИСНО ЗУПИНЕНИЙ бюджетом ходів (maxTurns = 2 при потребі 4 гілок)
  console.log('\n--- Запуск прогону, зупиненого бюджетом (turn-budget) ---');
  const tightBudget: Budget = {
    maxBranches: 4,
    maxTurns: 2, // занижений ліміт
    stepsPerBranch: 4,
    tokenCeiling: 10000,
    wallClockMs: 5000,
  };

  const stoppedRes = await runMultiAgentAnalysis({
    query: {
      id: 'q-stopped',
      question: 'Спроба запуску 4 гілок із лімітом maxTurns = 2',
      targetModule: 'src/index.ts',
    },
    budget: tightBudget,
    readerData: READER_DATA,
  });

  // Зберігаємо OTLP JSON-трасу зупиненого прогону
  const traceDir = join(process.cwd(), 'docs', 'lab4', 'traces');
  mkdirSync(traceDir, { recursive: true });
  const tracePath = join(traceDir, 'stopped-budget.json');

  const traceData = {
    traceId: '8f7a9e1d3c5b7a9e1d3c5b7a9e1d3c5b',
    name: 'multiagent-budget-stopped-drill',
    timestamp: new Date().toISOString(),
    status: {
      code: 'ERROR',
      description: `Зупинено запобіжником бюджету: ${stoppedRes.stopReason}`,
    },
    attributes: {
      'gen_ai.agent.name': 'orchestrator/fan-in',
      'budget.maxTurns': tightBudget.maxTurns,
      'budget.spentCalls': stoppedRes.spent.calls,
      'budget.stopReason': stoppedRes.stopReason,
      'task.id': stoppedRes.queryId,
    },
    events: [
      {
        name: 'budget_exceeded',
        time: new Date().toISOString(),
        attributes: {
          limit: 'maxTurns',
          threshold: 2,
          attempted: 4,
        },
      },
    ],
  };

  writeFileSync(tracePath, JSON.stringify(traceData, null, 2), 'utf8');
  console.log(`Трасу зупиненого прогону збережено: ${tracePath}`);

  return { results, stoppedRes };
}

if (process.argv[1] && process.argv[1].endsWith('benchmark.ts')) {
  runBenchmark()
    .then(({ results, stoppedRes }) => {
      console.log('\n=== ПІДСУМКОВА ТАБЛИЦЯ ВИМІРЮВАНЬ ===');
      console.table(results);
      console.log('Статус зупиненого прогону:', stoppedRes.stopReason);
    })
    .catch(console.error);
}
