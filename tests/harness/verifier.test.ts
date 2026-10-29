import { describe, expect, it } from 'vitest';
import {
  agreement,
  criterionVerdict,
  evaluateCriterion,
  isBlocked,
  verifyReport,
  type CriterionVerdict,
  type VerifyReport,
} from '../../scripts/harness/verifier';

describe('scripts/harness/verifier.ts', () => {
  describe('Zod Schemas', () => {
    it('валідує коректний criterionVerdict з вердиктом pass', () => {
      const valid = {
        id: 'c-01',
        verdict: 'pass',
        reason: 'Код відповідає всім типам та вимогам розрахунку',
        evidence: 'src/utils/met-calc.ts:24',
      };
      const parsed = criterionVerdict.parse(valid);
      expect(parsed).toEqual(valid);
    });

    it('валідує вердикт fail та unknown', () => {
      expect(
        criterionVerdict.parse({
          id: 'c-02',
          verdict: 'fail',
          reason: 'Формула розрахунку невірна',
          evidence: 'src/utils/met-calc.ts:30',
        }).verdict
      ).toBe('fail');

      expect(
        criterionVerdict.parse({
          id: 'c-03',
          verdict: 'unknown',
          reason: 'Артефакт не містить тестових даних',
          evidence: '',
        }).verdict
      ).toBe('unknown');
    });

    it('відхиляє зайві поля через .strict()', () => {
      expect(() =>
        criterionVerdict.parse({
          id: 'c-01',
          verdict: 'pass',
          reason: 'Все добре',
          evidence: 'src/test.ts:1',
          extraField: 'не дозволено',
        })
      ).toThrow();
    });

    it('відхиляє некоректний вердикт або порожній id', () => {
      expect(() =>
        criterionVerdict.parse({
          id: '',
          verdict: 'pass',
          reason: 'ok',
          evidence: 'test',
        })
      ).toThrow();

      expect(() =>
        criterionVerdict.parse({
          id: 'c-01',
          verdict: 'maybe',
          reason: 'ok',
          evidence: 'test',
        })
      ).toThrow();
    });

    it('валідує звіт verifyReport', () => {
      const report: VerifyReport = {
        results: [
          {
            id: 'c-01',
            verdict: 'pass',
            reason: 'ok',
            evidence: 'test:1',
          },
        ],
      };
      expect(verifyReport.parse(report).results).toHaveLength(1);

      expect(() => verifyReport.parse({ results: [] })).toThrow();
    });
  });

  describe('isBlocked', () => {
    it('не блокує, якщо ВСІ вердикти pass', () => {
      const report: VerifyReport = {
        results: [
          { id: '1', verdict: 'pass', reason: 'ok', evidence: 'f:1' },
          { id: '2', verdict: 'pass', reason: 'ok', evidence: 'f:2' },
        ],
      };
      expect(isBlocked(report)).toBe(false);
    });

    it('блокує, якщо хоча б один вердикт fail', () => {
      const report: VerifyReport = {
        results: [
          { id: '1', verdict: 'pass', reason: 'ok', evidence: 'f:1' },
          { id: '2', verdict: 'fail', reason: 'bad', evidence: 'f:2' },
        ],
      };
      expect(isBlocked(report)).toBe(true);
    });

    it('блокує, якщо хоча б один вердикт unknown (ключова вимога ЛР-3)', () => {
      const report: VerifyReport = {
        results: [
          { id: '1', verdict: 'pass', reason: 'ok', evidence: 'f:1' },
          { id: '2', verdict: 'unknown', reason: 'insufficient data', evidence: '' },
        ],
      };
      expect(isBlocked(report)).toBe(true);
    });
  });

  describe('agreement (каппа Коена)', () => {
    it('рахує 1.0 для ідеального збігу', () => {
      const mine = ['pass', 'pass', 'fail', 'fail', 'unknown'] as const;
      const judge = ['pass', 'pass', 'fail', 'fail', 'unknown'] as const;
      const res = agreement([...mine], [...judge]);
      expect(res.raw).toBe(1.0);
      expect(res.kappa).toBe(1.0);
      expect(res.n).toBe(5);
    });

    it('кидає помилку при різній довжині списків', () => {
      expect(() => agreement(['pass'], ['pass', 'fail'])).toThrow('різна довжина');
    });

    it('коректно обраховує часткову згоду', () => {
      // 10 випадків
      const mine = ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'fail', 'fail', 'unknown', 'pass'] as const;
      const judge = ['pass', 'pass', 'pass', 'pass', 'pass', 'fail', 'fail', 'fail', 'unknown', 'pass'] as const;
      const res = agreement([...mine], [...judge]);
      // 9 із 10 збіглися
      expect(res.raw).toBe(0.9);
      expect(res.kappa).toBeGreaterThan(0.7);
      expect(res.expected).toBeGreaterThan(0);
    });
  });

  describe('evaluateCriterion with mock runner', () => {
    it('успішно парсить валідну відповідь судді', async () => {
      const mockVerdict: CriterionVerdict = {
        id: 'crit-1',
        verdict: 'pass',
        reason: 'Реалізовано згідно зі специфікацією',
        evidence: 'src/calc.ts:15',
      };

      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(mockVerdict) } }],
          }),
          { status: 200 }
        );

      const res = await evaluateCriterion(
        { id: 'crit-1', description: 'desc', expectedEvidence: 'ev' },
        { diff: '', files: {} },
        { fetchFn: mockFetch, apiKey: 'mock' }
      );

      expect(res).toEqual(mockVerdict);
    });

    it('виконує рівно один retry при отриманні пошкодженого JSON і успішно завершується', async () => {
      let callCount = 0;
      const validVerdict: CriterionVerdict = {
        id: 'crit-retry',
        verdict: 'fail',
        reason: 'Помилка розрахунку',
        evidence: 'src/calc.ts:20',
      };

      const mockFetch: typeof fetch = async () => {
        callCount++;
        if (callCount === 1) {
          // Перший виклик повертає пошкоджений JSON
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: 'not valid json {{{' } }],
            }),
            { status: 200 }
          );
        }
        // Другий виклик (retry) повертає валідний результат
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(validVerdict) } }],
          }),
          { status: 200 }
        );
      };

      const res = await evaluateCriterion(
        { id: 'crit-retry', description: 'desc', expectedEvidence: 'ev' },
        { diff: '', files: {} },
        { fetchFn: mockFetch, apiKey: 'mock' }
      );

      expect(callCount).toBe(2);
      expect(res).toEqual(validVerdict);
    });

    it('падає з помилкою, якщо після retry відповідь все одно невалідна', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'still invalid json' } }],
          }),
          { status: 200 }
        );

      await expect(
        evaluateCriterion(
          { id: 'crit-fail', description: 'desc', expectedEvidence: 'ev' },
          { diff: '', files: {} },
          { fetchFn: mockFetch, apiKey: 'mock' }
        )
      ).rejects.toThrow();
    });
  });
});

