/**
 * Верифікатор на незалежній моделі як брама до злиття (Лабораторна 2, крок 03).
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/verify.ts [шлях-до-diff-файлу] [провайдер]
 * Приклад:
 *   git diff main...HEAD > docs/lab2/verify-input.diff
 *   npx tsx --env-file=.env.local scripts/verify.ts docs/lab2/verify-input.diff gemini
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { chatCompletionsModel } from '../src/agent/adapters';
import type { Model } from '../src/agent/agent-loop';
import { CATALOG, type ModelSpec } from '../src/models';
import { VerificationReport } from '../src/verify/schema';

function pickJudgeModel(kind: string): { model: Model; spec: ModelSpec } {
  if (kind === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY порожній: заповніть .env.local');
    const spec = CATALOG['gemini-3.8-flash'];
    return {
      spec,
      model: chatCompletionsModel({
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        model: spec.id,
        headers: { authorization: `Bearer ${key}` },
      }),
    };
  }

  if (kind === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY;
    const id = process.env.OPENROUTER_MODEL ?? 'nvidia/nemotron-3.5-lightning:free';
    if (!key) throw new Error('OPENROUTER_API_KEY порожній: заповніть .env.local');
    const spec: ModelSpec = {
      id,
      provider: 'openai',
      inputPerMTok: 0,
      outputPerMTok: 0,
      pricingUrl: 'https://openrouter.ai/models',
    };
    return {
      spec,
      model: chatCompletionsModel({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: id,
        headers: { authorization: `Bearer ${key}` },
      }),
    };
  }

  throw new Error(`Невідомий провайдер верифікатора: "${kind}". Доступні: gemini, openrouter`);
}

function getCriteria(): string {
  const specPath = 'docs/lab2/spec.md';
  if (!existsSync(specPath)) {
    throw new Error(`Не знайдено специфікацію: ${specPath}`);
  }
  const specText = readFileSync(specPath, 'utf8');
  const match = specText.match(/## 6\. Критерії приймання[\s\S]*?(?=##|$)/);
  return match ? match[0] : specText;
}

function getDiff(arg?: string): string {
  if (arg && existsSync(arg)) {
    return readFileSync(arg, 'utf8');
  }
  try {
    const diff = execSync('git diff HEAD~1..HEAD', { encoding: 'utf8' });
    if (diff.trim()) return diff;
    return execSync('git status --short', { encoding: 'utf8' });
  } catch {
    return 'Немає активного git diff (робоче дерево чисте).';
  }
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Відповідь моделі не містить JSON обʼєкта');
  return JSON.parse(match[0]);
}

async function main() {
  const diffArg = process.argv[2];
  const provider = process.argv[3] ?? 'gemini';

  console.log(`=== Верифікатор специфікації (провайдер: ${provider}) ===\n`);

  const criteria = getCriteria();
  const diff = getDiff(diffArg);
  const { model, spec } = pickJudgeModel(provider);

  const system = [
    'Ти незалежний автоматичний верифікатор специфікації (Judge Verifier).',
    'Твоя задача — оцінити наданий diff або зміну репозиторію на відповідність критеріям специфікації docs/lab2/spec.md.',
    'Для кожного критерію встанови статус: pass, fail або unknown (якщо даних у diff недостатньо, щоб судити — став unknown, не вгадуй).',
    'Відповідай ВИКЛЮЧНО валідним JSON-обʼєктом за схемою:',
    '{"summary": "короткий висновок", "verdicts": [{"id": "A1", "verdict": "pass"|"fail"|"unknown", "reason": "пояснення", "evidence": "шлях/рядок"}]}',
  ].join('\n');

  const prompt = [
    '### КРИТЕРІЇ ПРИЙМАННЯ ЗІ СПЕЦИФІКАЦІЇ:',
    criteria,
    '',
    '### ЗМІНА ДЛЯ ПЕРЕВІРКИ (DIFF / STATUS):',
    diff.slice(0, 15000), // захист від перевищення контексту
  ].join('\n');

  let report: VerificationReport | null = null;
  let rawText = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await model(
        system,
        [
          { role: 'user' as const, text: prompt },
          ...(attempt > 1 ? [{ role: 'user' as const, text: `Попередня відповідь не пройшла Zod-схему. Поверни суворий JSON.` }] : []),
        ],
        [],
      );
      rawText = res.text;
      const parsed = extractJson(rawText);
      const safe = VerificationReport.safeParse(parsed);
      if (safe.success) {
        report = safe.data;
        break;
      }
      console.warn(`[Спроба ${attempt}] Помилка Zod валідації:`, safe.error.message);
    } catch (e: unknown) {
      console.warn(`[Спроба ${attempt}] Помилка запиту:`, (e as Error).message);
    }
  }

  if (!report) {
    console.error('ПОМИЛКА: Не вдалося отримати структурований звіт верифікатора.');
    console.error('Отримана відповідь:', rawText);
    process.exit(1);
  }

  console.log(`Підсумок: ${report.summary}\n`);
  console.log('| ID | Вердикт | Причина | Доказ |');
  console.log('|---|---|---|---|');

  let hasFail = false;
  for (const v of report.verdicts) {
    const icon = v.verdict === 'pass' ? '✅ pass' : v.verdict === 'fail' ? '❌ FAIL' : '⚠️ unknown';
    console.log(`| ${v.id} | ${icon} | ${v.reason} | ${v.evidence ?? '—'} |`);
    if (v.verdict === 'fail') hasFail = true;
  }

  console.log('\n----------------------------------------');
  if (hasFail) {
    console.error('❌ БРАМА ВЕРИФІКАЦІЇ НЕ ПРОЙДЕНА: виявлено порушення критеріїв специфікації (код 1). Злиття заблоковано!');
    process.exit(1);
  } else {
    console.log('✅ БРАМА ВЕРИФІКАЦІЇ ПРОЙДЕНА (код 0). Усі критерії pass або unknown.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
