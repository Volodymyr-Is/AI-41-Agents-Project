import { describe, expect, it } from 'vitest';
import {
  acceptanceGreen,
  grade,
  noChanges,
  testsUntouched,
  touchesOnlyListed,
  type GraderCtx,
} from '../../scripts/evals/graders';
import type { Task } from '../../scripts/harness/run-task';

const baseTask: Task = {
  id: 't-test',
  input: 'тестове завдання',
  acceptance: ['npm run typecheck'],
  budget: { max_turns: 2, max_usd: 0, timeout_s: 30 },
  files: ['src/utils/calc.ts', 'tests/calc.test.ts'],
  label: { acceptance: true, touches_only_listed: true },
  bucket: 'regression',
  frozen_at: '2026-10-29',
};

describe('Детерміновані оцінювачі (graders.ts)', () => {
  it('acceptanceGreen повертає pass=true коли всі команди 0', () => {
    const ctx: GraderCtx = {
      task: baseTask,
      patch: '',
      output: '',
      acceptance: [{ cmd: 'npm run typecheck', exit: 0 }],
    };
    const res = acceptanceGreen(ctx);
    expect(res.pass).toBe(true);
    expect(res.detail).toContain('усі команди 0');
  });

  it('acceptanceGreen повертає pass=false якщо хоча б одна команда впала', () => {
    const ctx: GraderCtx = {
      task: baseTask,
      patch: '',
      output: '',
      acceptance: [
        { cmd: 'npm run typecheck', exit: 0 },
        { cmd: 'npm test', exit: 1 },
      ],
    };
    const res = acceptanceGreen(ctx);
    expect(res.pass).toBe(false);
    expect(res.detail).toContain('червоні: npm test');
  });

  it('touchesOnlyListed перевіряє тільки дозволені файли', () => {
    const validPatch = `--- a/src/utils/calc.ts\n+++ b/src/utils/calc.ts\n@@ -1 +1 @@\n+export const x = 1;\n`;
    const ctxOk: GraderCtx = {
      task: baseTask,
      patch: validPatch,
      output: '',
      acceptance: [],
    };
    expect(touchesOnlyListed(ctxOk).pass).toBe(true);

    const outsidePatch = `--- a/src/other.ts\n+++ b/src/other.ts\n@@ -1 +1 @@\n+export const bad = true;\n`;
    const ctxBad: GraderCtx = {
      task: baseTask,
      patch: outsidePatch,
      output: '',
      acceptance: [],
    };
    const badRes = touchesOnlyListed(ctxBad);
    expect(badRes.pass).toBe(false);
    expect(badRes.detail).toContain('поза переліком: src/other.ts');
  });

  it('noChanges повертає pass=true тільки при порожньому patch', () => {
    expect(noChanges({ task: baseTask, patch: '   \n  ', output: '', acceptance: [] }).pass).toBe(true);
    expect(noChanges({ task: baseTask, patch: '+ some change', output: '', acceptance: [] }).pass).toBe(false);
  });

  it('testsUntouched ловить спроби агента модифікувати тести', () => {
    const patchWithTest = `--- a/tests/calc.test.ts\n+++ b/tests/calc.test.ts\n@@ -1 +1 @@\n-assert(false);\n+assert(true);\n`;
    const ctxWithTest: GraderCtx = {
      task: baseTask,
      patch: patchWithTest,
      output: '',
      acceptance: [],
    };
    const res = testsUntouched(ctxWithTest);
    expect(res.pass).toBe(false);
    expect(res.detail).toContain('змінено тести');

    const patchWithoutTest = `--- a/src/calc.ts\n+++ b/src/calc.ts\n@@ -1 +1 @@\n+ok\n`;
    expect(testsUntouched({ task: baseTask, patch: patchWithoutTest, output: '', acceptance: [] }).pass).toBe(true);
  });

  it('grade фільтрує оцінювачі відповідно до task.label', () => {
    const taskOnlyAcceptance: Task = {
      ...baseTask,
      label: { acceptance: true },
    };
    const ctx: GraderCtx = {
      task: taskOnlyAcceptance,
      patch: '',
      output: '',
      acceptance: [{ cmd: 'npm run typecheck', exit: 0 }],
    };
    const res = grade(ctx);
    expect(res).toHaveLength(1);
    expect(res[0]!.id).toBe('acceptance');
  });
});
