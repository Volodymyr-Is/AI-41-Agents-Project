/**
 * БЮДЖЕТ мультиагентного питання: кроки, ходи, токени, час — плюс гілки.
 * Відповідає вимогам Лабораторної 4 (Крок 03).
 */

export interface Budget {
  /** Скільки гілок ЧИТАННЯ дозволено в одному раунді. */
  maxBranches: number;
  /** ХОДИ: скільки викликів моделі дозволено на все питання (гілки + звід + верифікатор). */
  maxTurns: number;
  /** КРОКИ: isStepCount(N) у stopWhen кожної гілки. */
  stepsPerBranch: number;
  /** ТОКЕНИ: стеля на все питання — входи + виходи всіх гілок і зводу. */
  tokenCeiling: number;
  /** ЧАС: стеля на все питання, мілісекунди. */
  wallClockMs: number;
}

/**
 * Структурний тип використання токенів: поля можуть бути невизначеними (number | undefined).
 */
export interface Usage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
}

export interface Spent {
  /** ХОДИ: скільки викликів моделі зроблено — саме це вичерпує добову квоту. */
  calls: number;
  input: number;
  output: number;
  /** Скільком викликам провайдер токенів НЕ повідомив. У звіт — як «не повідомлено». */
  unreported: number;
  /** СУМА часу по викликах — це час обчислення, а НЕ час до відповіді.
   *  Час до відповіді міряється навколо всього fanOut і живе окремо (wallMs). */
  ms: number;
}

export const emptySpent = (): Spent => ({
  calls: 0,
  input: 0,
  output: 0,
  unreported: 0,
  ms: 0,
});

export function addSpent(s: Spent, u: Usage, ms: number): Spent {
  const known = u.inputTokens !== undefined || u.outputTokens !== undefined;
  return {
    calls: s.calls + 1,
    input: s.input + (u.inputTokens ?? 0),
    output: s.output + (u.outputTokens ?? 0),
    unreported: s.unreported + (known ? 0 : 1),
    ms: s.ms + ms,
  };
}

/**
 * Гілка, що впала або була скасована, токени вже витратила — просто не звітує.
 * Ховати цей хід не можна: він списаний із квоти.
 */
export function addLostSpent(s: Spent, ms: number): Spent {
  return {
    ...s,
    calls: s.calls + 1,
    unreported: s.unreported + 1,
    ms: s.ms + ms,
  };
}

export const tokensUsed = (s: Spent): number => s.input + s.output;
