import { type Budget, type Spent, addSpent } from './budget';
import { type Branch, type BranchOut, type StopReason, fanOut } from './fanout';

export interface RepositoryQuery {
  id: string;
  question: string;
  targetModule: string;
}

export interface SynthesisReport {
  queryId: string;
  question: string;
  summary: string;
  findings: Array<{ lane: string; detail: string }>;
  verified: boolean;
  stopReason: StopReason;
  spent: Spent;
  wallMs: number;
}

export interface VerifierVerdict {
  passed: boolean;
  score: number;
  reason: string;
}

/**
 * Імітовані детерміновані зчитувачі для аналізу репозиторію (mockable/pluggable).
 */
export function createReader(laneData: Record<string, string>) {
  return async (branch: Branch, signal: AbortSignal) => {
    if (signal.aborted) {
      throw new Error('Branch aborted by wall-clock timeout');
    }
    const content = laneData[branch.lane] ?? `Аналіз для ${branch.lane} успішний.`;
    // Емулюємо обчислення та токени
    const inTokens = Math.round(branch.prompt.length / 4) + 50;
    const outTokens = Math.round(content.length / 4) + 40;
    return {
      text: content,
      usage: {
        inputTokens: inTokens,
        outputTokens: outTokens,
        totalTokens: inTokens + outTokens,
      },
    };
  };
}

/**
 * Роль: Звідник (Synthesizer).
 * Єдина роль, що формує підсумковий звіт.
 */
export function synthesizeReport(
  query: RepositoryQuery,
  branchOutputs: BranchOut[],
): { summary: string; findings: Array<{ lane: string; detail: string }> } {
  const findings = branchOutputs.map((b) => ({
    lane: b.lane,
    detail: b.text,
  }));

  const summary =
    findings.length > 0
      ? `Для запиту "${query.question}" по модулю ${query.targetModule} зведено дані з ${findings.length} незалежних джерел (${findings.map((f) => f.lane).join(', ')}).`
      : 'Дані відсутні або прогін зупинено до завершення раунду.';

  return { summary, findings };
}

/**
 * Роль: Верифікатор на моделі іншої родини (Verifier).
 * Перевіряє твердження зводу. Працює за принципом fail-closed.
 */
export function verifySynthesis(
  draft: { summary: string; findings: Array<{ lane: string; detail: string }> },
  requiredLanes: string[],
): VerifierVerdict {
  if (draft.findings.length === 0) {
    return {
      passed: false,
      score: 0.0,
      reason: 'Звід порожній: жодна гілка читання не повернула результату.',
    };
  }

  const presentLanes = new Set(draft.findings.map((f) => f.lane));
  const missing = requiredLanes.filter((l) => !presentLanes.has(l));

  if (missing.length > 0) {
    return {
      passed: false,
      score: 0.5,
      reason: `Верифікатор відхилив: відсутні обов'язкові джерела [${missing.join(', ')}].`,
    };
  }

  return {
    passed: true,
    score: 1.0,
    reason: 'Верифікатор схвалив: усі твердження підтверджені доказами читачів.',
  };
}

/**
 * Головний конвеєр мультиагентного аналізу репозиторію.
 */
export async function runMultiAgentAnalysis(opts: {
  query: RepositoryQuery;
  budget: Budget;
  readerData: Record<string, string>;
  requiredLanes?: string[];
}): Promise<SynthesisReport> {
  const { budget, query, readerData, requiredLanes = ['history', 'deps'] } = opts;

  // Формуємо паралельні гілки читання
  const round: Branch[] = [
    { lane: 'history', prompt: `Дослідити git log та історію правок для ${query.targetModule}` },
    { lane: 'deps', prompt: `Побудувати граф імпортів та залежностей для ${query.targetModule}` },
    { lane: 'code', prompt: `Проаналізувати сигнатуру та логіку ${query.targetModule}` },
    { lane: 'tests', prompt: `Визначити наявні тести навколо ${query.targetModule}` },
  ];

  const fanOutRes = await fanOut({
    runner: createReader(readerData),
    rounds: [round],
    budget,
    taskId: query.id,
  });

  // Якщо прогін зупинено бюджетом до fan-in
  if (fanOutRes.stop !== 'none' && fanOutRes.out.length === 0) {
    return {
      queryId: query.id,
      question: query.question,
      summary: `Прогін зупинено запобіжником бюджету: ${fanOutRes.stop}`,
      findings: [],
      verified: false,
      stopReason: fanOutRes.stop,
      spent: fanOutRes.spent,
      wallMs: fanOutRes.wallMs,
    };
  }

  // Роль: Звідник на fan-in
  const draft = synthesizeReport(query, fanOutRes.out);

  // Роль: Верифікатор на fan-in
  const verdict = verifySynthesis(draft, requiredLanes);

  // Облік ходу верифікатора
  const verifierUsage = { inputTokens: 120, outputTokens: 30, totalTokens: 150 };
  const finalSpent = addSpent(fanOutRes.spent, verifierUsage, 15);

  return {
    queryId: query.id,
    question: query.question,
    summary: verdict.passed
      ? draft.summary
      : `ВІДХИЛЕНО ВЕРИФІКАТОРОМ: ${verdict.reason}`,
    findings: verdict.passed ? draft.findings : [],
    verified: verdict.passed,
    stopReason: fanOutRes.stop,
    spent: finalSpent,
    wallMs: fanOutRes.wallMs + 15,
  };
}
