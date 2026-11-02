/**
 * Валить збірку на регресії.
 * Ненульовий код виходу — єдиний спосіб, яким GitHub Actions дізнається, що щось зламалося.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type EvalLine = {
  readonly task_id: string;
  readonly bucket: string;
  readonly frozen_at: string;
  readonly pass: boolean;
};

export type Baseline = Record<string, { pow_k: number; k: number; frozen_at: string }>;

export function checkRegression(options?: {
  logFile?: string;
  baselineFile?: string;
  writeBaseline?: boolean;
}): { success: boolean; broke: string[]; baselineWritten?: boolean } {
  const K = Number(process.env.EVAL_K ?? 3);
  const logFile = options?.logFile ?? 'docs/lab3/evals.jsonl';
  const baselineFile = options?.baselineFile ?? 'docs/lab3/evals-baseline.json';
  const shouldWrite = options?.writeBaseline ?? process.argv.includes('--write-baseline');

  if (!existsSync(logFile)) {
    console.error(`Журнал ${logFile} не знайдено`);
    return { success: false, broke: [`Журнал ${logFile} не знайдено`] };
  }

  const raw = readFileSync(logFile, 'utf8');
  const lines: EvalLine[] = raw
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as EvalLine);

  const now = new Map<string, { bucket: string; frozen_at: string; ok: number; n: number }>();
  for (const l of lines) {
    const c = now.get(l.task_id) ?? { bucket: l.bucket, frozen_at: l.frozen_at, ok: 0, n: 0 };
    now.set(l.task_id, { ...c, ok: c.ok + (l.pass ? 1 : 0), n: c.n + 1 });
  }

  if (shouldWrite) {
    const out: Baseline = {};
    for (const [id, c] of now) {
      out[id] = { pow_k: c.ok === c.n ? 1 : c.ok / c.n, k: K, frozen_at: c.frozen_at };
    }
    writeFileSync(baselineFile, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(`Базовий рівень записано на ${now.size} задач у ${baselineFile} — закомітьте його НАВМИСНО`);
    return { success: true, broke: [], baselineWritten: true };
  }

  if (!existsSync(baselineFile)) {
    console.error(`Файл базового рівня ${baselineFile} не знайдено. Спочатку запустіть з --write-baseline`);
    return { success: false, broke: [`Файл ${baselineFile} не знайдено`] };
  }

  const base = JSON.parse(readFileSync(baselineFile, 'utf8')) as Baseline;

  // Банк мусить бути той самий, інакше два числа непорівнянні — перевіряємо механічно
  const frozen = new Set([...now.values()].map((c) => c.frozen_at));
  if (frozen.size !== 1) {
    console.error(`Банк не заморожений: frozen_at = ${[...frozen].join(', ')}`);
    return { success: false, broke: [`Банк не заморожений: frozen_at = ${[...frozen].join(', ')}`] };
  }

  const broke: string[] = [];
  for (const [id, c] of now) {
    if (c.bucket !== 'regression') continue; // edge і new у брамі не беруть участі
    const was = base[id]?.pow_k ?? 0;
    const is = c.ok === c.n ? 1 : c.ok / c.n;
    if (was === 1 && is < 1) {
      broke.push(`${id}: було pass^${K}=1, стало ${c.ok}/${c.n}`);
    }
  }

  if (broke.length > 0) {
    console.error(`РЕГРЕСІЯ на ${broke.length} задачах:\n${broke.join('\n')}`);
    return { success: false, broke };
  }

  console.log(`Регресії немає: ${now.size} задач перевірено, k=${K}`);
  return { success: true, broke: [] };
}

if (process.argv[1]?.includes('gate')) {
  const res = checkRegression();
  if (!res.success) {
    process.exit(1);
  }
}

