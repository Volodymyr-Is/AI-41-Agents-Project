import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { verifyTask } from './verifier';

async function main() {
  console.log('=== Запуск незалежного верифікатора коду (Крок 02) ===');

  // Знаходимо найновіший артефакт прогону в docs/lab3/runs
  const root = join(process.cwd(), 'docs', 'lab3', 'runs');
  if (!existsSync(root)) {
    console.error(`Каталог ${root} не знайдено`);
    process.exit(1);
  }

  const dirs = readdirSync(root)
    .map((d) => join(root, d))
    .filter((p) => {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    });

  const latestDir = dirs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!latestDir) {
    console.error('Не знайдено жодного артефакту прогону в docs/lab3/runs');
    process.exit(1);
  }

  const runJsonPath = join(latestDir, 'run.json');
  if (!existsSync(runJsonPath)) {
    console.error(`Файл ${runJsonPath} не знайдено`);
    process.exit(1);
  }

  const runInfo = JSON.parse(readFileSync(runJsonPath, 'utf8')) as { task_id: string };
  console.log(`Оцінювання артефакту задачі: ${runInfo.task_id} (${latestDir})`);

  // Завантажуємо критерії з опису задачі
  const criteria = [
    {
      id: 'crit-export',
      description: 'Головна функція/модуль коректно експортовані з повною статичною типізацією аргументів',
      expectedEvidence: 'export function / export const у вихідному коді',
    },
    {
      id: 'crit-logic',
      description: 'Бізнес-логіка та формули точно відповідають вхідним вимогам задачі',
      expectedEvidence: 'рядки реалізації розрахунків та формул',
    },
    {
      id: 'crit-validation',
      description: 'Присутня валідація некоректних / граничних значень (throw Error або Zod schema)',
      expectedEvidence: 'перевірки if (...) throw Error або .refine() у Zod',
    },
    {
      id: 'crit-tests',
      description: 'Створено юніт-тести Vitest, що перевіряють як позитивні, так і граничні сценарії',
      expectedEvidence: 'тести describe/it у каталозі tests/',
    },
  ];

  const outDir = join(process.cwd(), 'docs', 'lab3', 'verdicts');
  const existingVerdict = join(outDir, `${runInfo.task_id}-verdict.json`);

  let report;
  let blocked = false;
  let verdictFile = existingVerdict;

  const hasApiKey = Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);

  if (hasApiKey) {
    const res = await verifyTask(runInfo.task_id, criteria, latestDir);
    report = res.report;
    blocked = res.blocked;
    verdictFile = res.verdictFile;
  } else if (existsSync(existingVerdict)) {
    console.log(`[CI / Offline]: GEMINI_API_KEY не знайдено в env, перевірка збереженого вердикту ${existingVerdict}`);
    report = JSON.parse(readFileSync(existingVerdict, 'utf8'));
    blocked = report.results.some((r: { verdict: string }) => r.verdict !== 'pass');
  } else {
    console.error('Помилка: GEMINI_API_KEY не задано та відсутній збережений вердикт');
    process.exit(1);
  }

  console.log(`\nВердикти збережено у: ${verdictFile}`);
  console.log(JSON.stringify(report, null, 2));

  if (blocked) {
    console.error('\n[БЛОКУВАННЯ ЗЛИТТЯ]: Верифікатор відхилив зміну! Не всі критерії мають статус "pass".');
    process.exit(1);
  } else {
    console.log('\n[ВЕРИФІКАЦІЯ УСПІШНА]: Усі критерії підтверджені доказами зі статусом "pass".');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Критична помилка верифікатора:', err);
  process.exit(1);
});

