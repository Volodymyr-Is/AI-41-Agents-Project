/**
 * Детерміновані оцінювачі (крок 04).
 * Чисті функції від артефакту прогону: ні мережі, ні моделі, ні годинника.
 * Через це вони виконуються на кожен коміт.
 */
import type { Task } from '../harness/run-task';

export interface GraderCtx {
  readonly task: Task;
  /** Вміст patch.diff з теки артефакту */
  readonly patch: string;
  /** Вміст output.txt */
  readonly output: string;
  /** Результат acceptance-команд із run.json */
  readonly acceptance: readonly { readonly cmd: string; readonly exit: number }[];
}

export interface GraderResult {
  readonly id: string;
  readonly pass: boolean;
  /** Чому саме так — рядок іде в журнал evals, а не в консоль */
  readonly detail: string;
}

export type Grader = (ctx: GraderCtx) => GraderResult;

/** Усі acceptance-команди задачі завершилися кодом 0. */
export const acceptanceGreen: Grader = (c) => {
  const bad = c.acceptance.filter((a) => a.exit !== 0);
  return {
    id: 'acceptance',
    pass: c.acceptance.length > 0 && bad.length === 0,
    detail: bad.length === 0 ? 'усі команди 0' : `червоні: ${bad.map((a) => a.cmd).join('; ')}`,
  };
};

/** Diff не торкається нічого поза переліком files задачі. */
export const touchesOnlyListed: Grader = (c) => {
  const allowed = new Set(c.task.files ?? []);
  // Рядки виду "+++ b/src/cost.ts"; /dev/null — видалення файлу
  const touched = [...c.patch.matchAll(/^\+\+\+ b\/(.+)$/gm)]
    .map((m) => m[1]?.trim() ?? '')
    .filter((p) => p !== '' && p !== '/dev/null');
  const outside = touched.filter((p) => !allowed.has(p));
  return {
    id: 'touches_only_listed',
    pass: outside.length === 0,
    detail: outside.length === 0 ? `торкнуто ${touched.length}` : `поза переліком: ${outside.join(', ')}`,
  };
};

/** Агент не змінив НІЧОГО — правильна відповідь на нерелевантний вхід. */
export const noChanges: Grader = (c) => ({
  id: 'no_changes',
  pass: c.patch.trim() === '',
  detail: c.patch.trim() === '' ? 'diff порожній' : `diff на ${c.patch.length} символів`,
});

/** Жодного файлу тестів у diff: тести правити агентові заборонено. */
export const testsUntouched: Grader = (c) => {
  const hits = [...c.patch.matchAll(/^\+\+\+ b\/(.*tests?\/.+)$/gm)]
    .map((m) => m[1]?.trim() ?? '')
    .filter((p) => p !== '');
  return {
    id: 'tests_untouched',
    pass: hits.length === 0,
    detail: hits.length === 0 ? 'тести не змінено' : `змінено тести: ${hits.join(', ')}`,
  };
};

export const GRADERS: readonly Grader[] = [acceptanceGreen, touchesOnlyListed, noChanges, testsUntouched];

/** Застосовуємо лише ті оцінювачі, які згадані в label задачі. */
export function grade(ctx: GraderCtx): GraderResult[] {
  const want = new Set(Object.keys(ctx.task.label ?? {}));
  return GRADERS.map((g) => g(ctx)).filter((r) => want.has(r.id));
}
