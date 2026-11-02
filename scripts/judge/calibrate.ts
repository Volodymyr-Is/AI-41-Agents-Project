import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { MODELS } from '../../src/models';

export type Label = 'pass' | 'fail' | 'unknown';
export const LABELS: readonly Label[] = ['pass', 'fail', 'unknown'] as const;

export interface JudgeCase {
  case_id: string;
  task_id: string;
  dimension: 'correctness' | 'boundary' | 'safety' | 'style' | 'reproducibility' | string;
  criterion: string;
  artifact: string;
  mine: Label;
  reason: string;
  holdout: boolean;
}

export const judgeVerdictSchema = z
  .object({
    case_id: z.string().min(1),
    dimension: z.string().optional(),
    verdict: z.enum(['pass', 'fail', 'unknown']),
    reason: z.string().min(1),
    evidence: z.string(),
    model: z.string().optional(),
    order: z.string().optional(),
    durationMs: z.number().optional(),
  })
  .strict();

export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

export type MatrixCellCounts = Record<Label, number>;
export type ConfusionMatrix = Record<Label, MatrixCellCounts>;

/**
 * Побудова матриці невідповідностей 3x3:
 * рядки — мій людський вердикт (mine)
 * стовпчики — вердикт моделі-судді (judge)
 */
export function buildConfusionMatrix(pairs: { mine: Label; judge: Label }[]): ConfusionMatrix {
  const matrix: ConfusionMatrix = {
    pass: { pass: 0, fail: 0, unknown: 0 },
    fail: { pass: 0, fail: 0, unknown: 0 },
    unknown: { pass: 0, fail: 0, unknown: 0 },
  };

  for (const pair of pairs) {
    if (matrix[pair.mine] && typeof matrix[pair.mine][pair.judge] === 'number') {
      matrix[pair.mine][pair.judge]++;
    }
  }

  return matrix;
}

/**
 * Аналіз асиметрії помилок:
 * - Pass-throughs (пропуск браку): mine='fail' -> judge='pass' (критичний ризик витоку бага в main)
 * - False alarms (хибна тривога): mine='pass' -> judge='fail' (податок на продуктивність команди)
 */
export function calculateAsymmetry(pairs: { case_id: string; mine: Label; judge: Label }[]) {
  const passThroughs = pairs.filter((p) => p.mine === 'fail' && p.judge === 'pass');
  const falseAlarms = pairs.filter((p) => p.mine === 'pass' && p.judge === 'fail');

  const totalFails = pairs.filter((p) => p.mine === 'fail').length;
  const totalPasses = pairs.filter((p) => p.mine === 'pass').length;

  const passThroughRate = totalFails > 0 ? passThroughs.length / totalFails : 0;
  const falseAlarmRate = totalPasses > 0 ? falseAlarms.length / totalPasses : 0;

  return {
    passThroughs,
    falseAlarms,
    passThroughRate,
    falseAlarmRate,
  };
}

/**
 * Розрахунок метрик узгодженості та каппи Коена
 */
export function calculateAgreement(mine: Label[], judge: Label[]) {
  const n = mine.length;
  if (n === 0 || n !== judge.length) {
    throw new Error('Довжини масивів розмітки повинні співпадати та бути більше 0');
  }

  // Сира згода (Po)
  const raw = mine.filter((m, i) => m === judge[i]).length / n;

  // Очікувана випадкова згода (Pe)
  const expected = LABELS.reduce((acc, label) => {
    const pm = mine.filter((x) => x === label).length / n;
    const pj = judge.filter((x) => x === label).length / n;
    return acc + pm * pj;
  }, 0);

  // Каппа Коена: (Po - Pe) / (1 - Pe)
  const kappa = Math.abs(1 - expected) < 1e-9 ? 1.0 : (raw - expected) / (1 - expected);

  return { n, raw, expected, kappa };
}

/**
 * Формування промпта для моделі-судді
 */
export function buildJudgePrompt(caseItem: JudgeCase): string {
  return `Ти — незалежний суворий суддя якості коду та результатів роботи автономних агентів.
Твоє завдання — об'єктивно оцінити наданий артефакт за вказаним критерієм та виміром якості.

ПАРАМЕТРИ ОЦІНЮВАННЯ:
- ID випадку: "${caseItem.case_id}"
- Задача: "${caseItem.task_id}"
- Вимір якості (dimension): "${caseItem.dimension}"
- Критерій оцінки: "${caseItem.criterion}"

АРТЕФАКТ ДЛЯ ОЦІНЮВАННЯ:
\`\`\`
${caseItem.artifact}
\`\`\`

РУБРИКА ОЦІНЮВАННЯ:
1. "pass" — артефакт повністю задовольняє критерій, код коректний, безпечний та відповідає вимогам виміру якості.
2. "fail" — артефакт порушує критерій (містить помилку, вразливість, дефект логіки або порушення стилю).
3. "unknown" — артефакт обрізаний, пошкоджений або даних недостатньо для впевненого судження.

ПРАВИЛО ВІДПОВІДІ:
Поверни ВИКЛЮЧНО валідний JSON-об'єкт строго за такою схемою без будь-яких приміток або markdown-блоків:
{
  "case_id": "${caseItem.case_id}",
  "verdict": "pass" | "fail" | "unknown",
  "reason": "Чітке пояснення українською мовою (1-2 речення)",
  "evidence": "Цитата з артефакту або порожній рядок для unknown"
}`;
}

export interface JudgeOptions {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
}

/**
 * Оцінка одного кейсу моделлю-суддею
 */
export async function evaluateJudgeCase(
  caseItem: JudgeCase,
  options: JudgeOptions = {}
): Promise<JudgeVerdict> {
  const startTime = Date.now();
  const prompt = buildJudgePrompt(caseItem);

  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '';
  const apiUrl =
    options.apiUrl ??
    (process.env.GEMINI_API_KEY
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions');

  // Використовуємо роль cheap із models.ts згідно з AGENTS.md
  const model = options.model ?? (process.env.GEMINI_API_KEY ? 'gemini-2.5-flash' : MODELS.cheap.id);
  const customFetch = options.fetchFn ?? fetch;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await customFetch(apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content?.trim() ?? '';
      const parsed = JSON.parse(content);
      const validated = judgeVerdictSchema.parse({
        ...parsed,
        case_id: caseItem.case_id,
        dimension: caseItem.dimension,
        model,
        order: 'none',
        durationMs: Date.now() - startTime,
      });

      return validated;
    } catch (err) {
      lastError = err;
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw new Error(`Не вдалося оцінити ${caseItem.case_id}: ${String(lastError)}`);
}

/**
 * Читання розмічених кейсів
 */
export function loadJudgeCases(filePath: string): JudgeCase[] {
  if (!existsSync(filePath)) {
    throw new Error(`Файл кейсів не знайдено: ${filePath}`);
  }
  const content = readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as JudgeCase);
}

/**
 * Читання збережених вердиктів
 */
export function loadExistingVerdicts(filePath: string): Map<string, JudgeVerdict> {
  const map = new Map<string, JudgeVerdict>();
  if (!existsSync(filePath)) return map;

  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const verdict = judgeVerdictSchema.parse(JSON.parse(trimmed));
      map.set(verdict.case_id, verdict);
    } catch {
      // ігноруємо некоректні рядки
    }
  }
  return map;
}

/**
 * Збереження вердиктів у jsonl
 */
export function saveVerdicts(filePath: string, verdicts: JudgeVerdict[]): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const lines = verdicts.map((v) => JSON.stringify(v)).join('\n') + '\n';
  writeFileSync(filePath, lines, 'utf-8');
}

/**
 * Головний запуск калібрування судді
 */
export async function runJudgeCalibration(
  casesPath = join(process.cwd(), 'docs', 'lab3', 'judge-cases.jsonl'),
  verdictsPath = join(process.cwd(), 'docs', 'lab3', 'verdicts', 'judge.jsonl'),
  options: JudgeOptions & { refresh?: boolean } = {}
) {
  const cases = loadJudgeCases(casesPath);
  const existingVerdicts = options.refresh ? new Map<string, JudgeVerdict>() : loadExistingVerdicts(verdictsPath);

  console.log(`Завантажено ${cases.length} кейсів для калібрування судді.`);
  const allVerdicts: JudgeVerdict[] = [];

  for (const c of cases) {
    let verdict = existingVerdicts.get(c.case_id);
    if (!verdict) {
      console.log(`Запит вердикту для ${c.case_id} (${c.dimension})...`);
      verdict = await evaluateJudgeCase(c, options);
    }
    allVerdicts.push(verdict);
  }

  saveVerdicts(verdictsPath, allVerdicts);

  const verdictMap = new Map(allVerdicts.map((v) => [v.case_id, v]));
  const evaluatedPairs = cases.map((c) => ({
    case_id: c.case_id,
    mine: c.mine,
    judge: verdictMap.get(c.case_id)!.verdict,
    dimension: c.dimension,
    holdout: c.holdout,
  }));

  // Загальна матриця невідповідностей
  const matrix = buildConfusionMatrix(evaluatedPairs);
  const asymmetry = calculateAsymmetry(evaluatedPairs);
  const overall = calculateAgreement(
    evaluatedPairs.map((p) => p.mine),
    evaluatedPairs.map((p) => p.judge)
  );

  // Окремо для dev та holdout
  const devPairs = evaluatedPairs.filter((p) => !p.holdout);
  const holdoutPairs = evaluatedPairs.filter((p) => p.holdout);

  const devAgreement = calculateAgreement(
    devPairs.map((p) => p.mine),
    devPairs.map((p) => p.judge)
  );
  const holdoutAgreement = calculateAgreement(
    holdoutPairs.map((p) => p.mine),
    holdoutPairs.map((p) => p.judge)
  );

  // Окремо по вимірах
  const dimensions = Array.from(new Set(cases.map((c) => c.dimension)));
  const dimensionStats = dimensions.map((dim) => {
    const dimPairs = evaluatedPairs.filter((p) => p.dimension === dim);
    const agr = calculateAgreement(
      dimPairs.map((p) => p.mine),
      dimPairs.map((p) => p.judge)
    );
    return { dimension: dim, count: dimPairs.length, ...agr };
  });

  return {
    totalCases: cases.length,
    overall,
    matrix,
    asymmetry,
    devAgreement,
    holdoutAgreement,
    dimensionStats,
    verdicts: allVerdicts,
  };
}

if (process.argv[1]?.includes('calibrate')) {
  const refresh = process.argv.includes('--refresh');
  runJudgeCalibration(undefined, undefined, { refresh })
    .then((res) => {
      console.log('\n=== РЕЗУЛЬТАТИ КАЛІБРУВАННЯ МОДЕЛІ-СУДДІ ===');
      console.log(`Всього кейсів: ${res.totalCases}`);
      console.log(`Сира згода (Po): ${(res.overall.raw * 100).toFixed(1)}%`);
      console.log(`Очікувана випадкова згода (Pe): ${(res.overall.expected * 100).toFixed(1)}%`);
      console.log(`Каппа Коена (kappa): ${res.overall.kappa.toFixed(4)}`);
      console.log('\n--- Матриця невідповідностей 3x3 (Mine \\ Judge) ---');
      console.table(res.matrix);
      console.log('\n--- Асиметрія помилок ---');
      console.log(`Pass-throughs (mine: fail -> judge: pass): ${res.asymmetry.passThroughs.length} (${(res.asymmetry.passThroughRate * 100).toFixed(1)}%)`);
      console.log(`False alarms  (mine: pass -> judge: fail): ${res.asymmetry.falseAlarms.length} (${(res.asymmetry.falseAlarmRate * 100).toFixed(1)}%)`);
      console.log('\n--- Розбиття Dev vs Holdout ---');
      console.log(`Dev set (N=${res.devAgreement.n}): Po=${(res.devAgreement.raw * 100).toFixed(1)}%, kappa=${res.devAgreement.kappa.toFixed(4)}`);
      console.log(`Holdout (N=${res.holdoutAgreement.n}): Po=${(res.holdoutAgreement.raw * 100).toFixed(1)}%, kappa=${res.holdoutAgreement.kappa.toFixed(4)}`);
      console.log('\n--- По вимірах якості ---');
      console.table(res.dimensionStats);
    })
    .catch((err) => {
      console.error('Помилка калібрування:', err);
      process.exit(1);
    });
}
