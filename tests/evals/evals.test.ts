import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkRegression } from '../../scripts/evals/gate';
import { runEvals, summarize } from '../../scripts/evals/run-evals';

describe('Evals та регресійна брама (Крок 04)', () => {
  let tempDir: string;
  let logFile: string;
  let baselineFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'evals-test-'));
    logFile = join(tempDir, 'evals.jsonl');
    baselineFile = join(tempDir, 'evals-baseline.json');
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('summarize (pass@k та pass^k)', () => {
    it('правильно рахує pass@k і pass^k для k=3', () => {
      const lines = [
        // t-01: 3/3 успішні
        { task_id: 't-01', bucket: 'regression', pass: true },
        { task_id: 't-01', bucket: 'regression', pass: true },
        { task_id: 't-01', bucket: 'regression', pass: true },
        // t-02: 1/3 успішна
        { task_id: 't-02', bucket: 'regression', pass: true },
        { task_id: 't-02', bucket: 'regression', pass: false },
        { task_id: 't-02', bucket: 'regression', pass: false },
        // t-03: 0/3 успішних
        { task_id: 't-03', bucket: 'regression', pass: false },
        { task_id: 't-03', bucket: 'regression', pass: false },
        { task_id: 't-03', bucket: 'regression', pass: false },
      ];

      const res = summarize(lines, 3);
      expect(res).toHaveLength(1);
      const reg = res[0]!;
      expect(reg.bucket).toBe('regression');
      expect(reg.tasks).toBe(3);
      // pass@3: t-01 і t-02 мають хоча б один успіх (2/3 = 66.7%)
      expect(reg.pass_at_k).toBeCloseTo(2 / 3);
      // pass^3: тільки t-01 має всі успішні (1/3 = 33.3%)
      expect(reg.pass_pow_k).toBeCloseTo(1 / 3);
    });
  });

  describe('gate.ts (регресійна брама)', () => {
    it('записує базовий рівень при --write-baseline', () => {
      const sampleLines = [
        { task_id: 't-01', bucket: 'regression', frozen_at: '2026-10-29', pass: true },
        { task_id: 't-01', bucket: 'regression', frozen_at: '2026-10-29', pass: true },
        { task_id: 't-02', bucket: 'regression', frozen_at: '2026-10-29', pass: true },
      ];
      writeFileSync(logFile, sampleLines.map((l) => JSON.stringify(l)).join('\n') + '\n');

      const res = checkRegression({
        logFile,
        baselineFile,
        writeBaseline: true,
      });

      expect(res.success).toBe(true);
      expect(existsSync(baselineFile)).toBe(true);
      const base = JSON.parse(readFileSync(baselineFile, 'utf8'));
      expect(base['t-01'].pow_k).toBe(1);
    });

    it('пропускає прогін коли регресії немає', () => {
      const sampleLines = [
        { task_id: 't-01', bucket: 'regression', frozen_at: '2026-10-29', pass: true },
      ];
      writeFileSync(logFile, sampleLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      writeFileSync(
        baselineFile,
        JSON.stringify({
          't-01': { pow_k: 1, k: 1, frozen_at: '2026-10-29' },
        })
      );

      const res = checkRegression({
        logFile,
        baselineFile,
        writeBaseline: false,
      });
      expect(res.success).toBe(true);
      expect(res.broke).toHaveLength(0);
    });

    it('блокує прогін (регресія) коли задача з pass^k=1 впала', () => {
      const sampleLines = [
        { task_id: 't-01', bucket: 'regression', frozen_at: '2026-10-29', pass: false },
      ];
      writeFileSync(logFile, sampleLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      writeFileSync(
        baselineFile,
        JSON.stringify({
          't-01': { pow_k: 1, k: 1, frozen_at: '2026-10-29' },
        })
      );

      const res = checkRegression({
        logFile,
        baselineFile,
        writeBaseline: false,
      });
      expect(res.success).toBe(false);
      expect(res.broke[0]).toContain('t-01');
    });

    it('ігнорує кошики edge та new при перевірці регресії', () => {
      const sampleLines = [
        { task_id: 't-edge', bucket: 'edge', frozen_at: '2026-10-29', pass: false },
        { task_id: 't-new', bucket: 'new', frozen_at: '2026-10-29', pass: false },
      ];
      writeFileSync(logFile, sampleLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      writeFileSync(
        baselineFile,
        JSON.stringify({
          't-edge': { pow_k: 1, k: 1, frozen_at: '2026-10-29' },
          't-new': { pow_k: 1, k: 1, frozen_at: '2026-10-29' },
        })
      );

      const res = checkRegression({
        logFile,
        baselineFile,
        writeBaseline: false,
      });
      expect(res.success).toBe(true);
      expect(res.broke).toHaveLength(0);
    });
  });

  describe('runEvals dry-run', () => {
    it('виконує прогін для банку задач у dryRun режимі', async () => {
      const sampleBank = join(tempDir, 'sample-tasks.jsonl');
      const task = {
        id: 't-sample',
        input: 'test',
        acceptance: ['npm run typecheck'],
        budget: { max_turns: 2, max_usd: 0, timeout_s: 30 },
        files: [],
        label: { acceptance: true },
        bucket: 'regression',
        frozen_at: '2026-10-29',
      };
      writeFileSync(sampleBank, JSON.stringify(task) + '\n');

      const { generatedLines, summary } = await runEvals({
        bankFile: sampleBank,
        logFile,
        k: 2,
        dryRun: true,
      });

      expect(generatedLines).toHaveLength(2);
      expect(summary).toHaveLength(1);
      expect(summary[0]!.pass_pow_k).toBe(1);
    });
  });
});
