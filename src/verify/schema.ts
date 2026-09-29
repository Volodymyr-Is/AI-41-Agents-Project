/**
 * Схема структурованого вердикту верифікатора (Лабораторна 2, крок 03).
 */
import { z } from 'zod';

export const VERDICTS = ['pass', 'fail', 'unknown'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CriterionVerdict = z
  .object({
    id: z.string().min(1),
    verdict: z.enum(VERDICTS),
    reason: z.string().min(1),
    evidence: z.string().optional(),
  })
  .strict();

export type CriterionVerdict = z.infer<typeof CriterionVerdict>;

export const VerificationReport = z
  .object({
    summary: z.string().min(1),
    verdicts: z.array(CriterionVerdict).min(1),
  })
  .strict();

export type VerificationReport = z.infer<typeof VerificationReport>;
