import { describe, expect, it } from 'vitest';
import { CriterionVerdict, VerificationReport } from '../src/verify/schema';

describe('Verification Schema', () => {
  it('валідує коректний звіт', () => {
    const valid = {
      summary: 'Зміна відповідає критеріям A1 та A2',
      verdicts: [
        { id: 'A1', verdict: 'pass', reason: 'Тести пройшли', evidence: 'tests/validate-golden.test.ts' },
        { id: 'A2', verdict: 'unknown', reason: 'Потрібен прогін CI' },
      ],
    };

    const res = VerificationReport.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it('відхиляє невалідний вердикт', () => {
    const invalid = {
      id: 'A1',
      verdict: 'maybe', // недопустимий статус
      reason: 'Можливо проходить',
    };

    const res = CriterionVerdict.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it('вимагає непорожнього масиву вердиктів', () => {
    const empty = {
      summary: 'Порожній звіт',
      verdicts: [],
    };

    const res = VerificationReport.safeParse(empty);
    expect(res.success).toBe(false);
  });
});
