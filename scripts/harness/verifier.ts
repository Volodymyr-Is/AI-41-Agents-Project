import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/** Один критерій приймання задачі з черги — один запис вердикту. */
export const criterionVerdict = z
  .object({
    /** Ідентифікатор критерію з опису задачі, дослівно. */
    id: z.string().min(1),
    /** unknown — аварійний вихід: даних в артефакті недостатньо для судження. */
    verdict: z.enum(['pass', 'fail', 'unknown']),
    /** Чому саме так. Одне-два речення, без загальних порад. */
    reason: z.string().min(1),
    /** Файл і рядок або цитата з артефакту; порожньо лише для unknown. */
    evidence: z.string(),
  })
  .strict();

export const verifyReport = z
  .object({
    results: z.array(criterionVerdict).min(1),
  })
  .strict();

export type CriterionVerdict = z.infer<typeof criterionVerdict>;
export type VerifyReport = z.infer<typeof verifyReport>;

/**
 * УВАГА: у Лаб. 2 браму валив лише fail.
 * У харнесі блокує все, що не pass:
 * unknown нікому розбирати вручну, бо прогін автономний.
 */
export function isBlocked(report: VerifyReport): boolean {
  return report.results.some((r) => r.verdict !== 'pass');
}

export type Label = 'pass' | 'fail' | 'unknown';
export const LABELS: Label[] = ['pass', 'fail', 'unknown'];

/**
 * Розрахунок узгодженості оцінок:
 * mine[i] — мій ручний вердикт, judge[i] — вердикт верифікатора.
 */
export function agreement(mine: Label[], judge: Label[]) {
  const n = mine.length;
  if (n === 0 || n !== judge.length) throw new Error('різна довжина розмітки');

  // сира згода: частка точних збігів
  const po = mine.filter((m, i) => m === judge[i]).length / n;

  // очікувана випадкова згода: сума добутків маргінальних часток
  const pe = LABELS.reduce((acc, l) => {
    const pm = mine.filter((x) => x === l).length / n;
    const pj = judge.filter((x) => x === l).length / n;
    return acc + pm * pj;
  }, 0);

  // каппа Коена; pe === 1 означає, що всі мітки однакові — каппа не визначена
  const kappa = pe === 1 ? NaN : (po - pe) / (1 - pe);
  return { n, raw: po, expected: pe, kappa };
}

export interface JudgeOptions {
  apiKey?: string;
  model?: string;
  apiUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Формує промпт для судді за принципом «один суддя — один вимір».
 */
export function buildCriterionPrompt(
  criterion: { id: string; description: string; expectedEvidence: string },
  artifact: { diff: string; files: Record<string, string> }
): string {
  const filesList = Object.entries(artifact.files)
    .map(([path, content]) => `--- ФАЙЛ: ${path} ---\n${content}\n`)
    .join('\n');

  return `Ти — незалежний суворий суддя-верифікатор коду в автономному харнесі.
Твоє завдання — перевірити РІВНО ОДИН критерій приймання задачі за наданим артефактом змін.

КРИТЕРІЙ ДЛЯ ПЕРЕВІРКИ:
- id: "${criterion.id}"
- Опис: "${criterion.description}"
- Очікуваний доказ (evidence): "${criterion.expectedEvidence}"

АРТЕФАКТ ЗМІН (DIFF):
\`\`\`diff
${artifact.diff}
\`\`\`

ВМІСТ ФАЙЛІВ:
${filesList}

РУБРИКА ОЦІНЮВАННЯ:
1. "pass": Зміна повністю, однозначно і коректно задовольняє цей критерій. У полі "evidence" наведено конкретний файл і рядок або точну цитату коду, що це підтверджує.
2. "fail": Зміна прямо порушує критерій або реалізована неправильно / не відповідає очікуваному результату. У "evidence" наведено рядок/місце помилки.
3. "unknown": Даних в наданому артефакті недостатньо, щоб зробити достовірний висновок (наприклад, файл не створено або відсутній потрібний фрагмент). "evidence" у такому разі має бути порожнім рядком "".

ПРАВИЛО ФОРМАТУВАННЯ:
Поверни ВИКЛЮЧНО валідний JSON-об'єкт строго за схемою без будь-якого стороннього тексту чи markdown-обгорток:
{
  "id": "${criterion.id}",
  "verdict": "pass" | "fail" | "unknown",
  "reason": "Чому саме такий вердикт (1-2 речення)",
  "evidence": "Файл і рядок або цитата з артефакту (порожній рядок лише для unknown)"
}`;
}

/**
 * Оцінює один окремий критерій із захистом retry (рівно один повторний запит при збої валідації).
 */
export async function evaluateCriterion(
  criterion: { id: string; description: string; expectedEvidence: string },
  artifact: { diff: string; files: Record<string, string> },
  options: JudgeOptions = {}
): Promise<CriterionVerdict> {
  const prompt = buildCriterionPrompt(criterion, artifact);
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '';
  const apiUrl =
    options.apiUrl ??
    (process.env.GEMINI_API_KEY
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions');
  const model =
    options.model ??
    (process.env.GEMINI_API_KEY ? 'gemini-3.8-flash' : 'google/gemma-4-31b-it:free');

  const customFetch = options.fetchFn ?? fetch;

  async function callJudge(userPrompt: string): Promise<string> {
    let lastErr: unknown;
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
            messages: [{ role: 'user', content: userPrompt }],
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Помилка API судді (${res.status}): ${err}`);
        }

        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return data.choices?.[0]?.message?.content ?? '';
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }
    throw lastErr;
  }

  // Перша спроба
  let raw = await callJudge(prompt);
  try {
    const cleanJson = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    return criterionVerdict.parse(JSON.parse(cleanJson));
  } catch (errFirst) {
    // Рівно один retry з вказівкою на помилку валідації
    const retryPrompt = `${prompt}\n\nУВАГА: попередня відповідь була невалідною: ${
      errFirst instanceof Error ? errFirst.message : String(errFirst)
    }. Сирий вивід: ${raw}. Поверни строго валідний JSON без markdown!`;

    const rawRetry = await callJudge(retryPrompt);
    const cleanRetry = rawRetry.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    return criterionVerdict.parse(JSON.parse(cleanRetry));
  }
}

/**
 * Верифікація всієї задачі: оцінює всі критерії та зберігає звіт.
 */
export async function verifyTask(
  taskId: string,
  criteria: Array<{ id: string; description: string; expectedEvidence: string }>,
  artifactDir: string,
  options: JudgeOptions = {}
): Promise<{ report: VerifyReport; blocked: boolean; verdictFile: string }> {
  // Читаємо артефакт
  const diffPath = join(artifactDir, 'patch.diff');
  const diff = existsSync(diffPath) ? readFileSync(diffPath, 'utf8') : '';

  const files: Record<string, string> = {};
  const outputFilePath = join(artifactDir, 'output.txt');
  if (existsSync(outputFilePath)) {
    files['output.txt'] = readFileSync(outputFilePath, 'utf8').slice(0, 4000);
  }

  const results: CriterionVerdict[] = [];
  for (const criterion of criteria) {
    const verdict = await evaluateCriterion(criterion, { diff, files }, options);
    results.push(verdict);
  }

  const report: VerifyReport = verifyReport.parse({ results });
  const blocked = isBlocked(report);

  const outDir = join(process.cwd(), 'docs', 'lab3', 'verdicts');
  mkdirSync(outDir, { recursive: true });
  const verdictFile = join(outDir, `${taskId}-verdict.json`);
  writeFileSync(verdictFile, JSON.stringify(report, null, 2) + '\n', 'utf8');

  return { report, blocked, verdictFile };
}

