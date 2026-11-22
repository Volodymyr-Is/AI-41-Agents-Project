import { performance } from 'node:perf_hooks';
import {
  type Budget,
  type Spent,
  type Usage,
  addLostSpent,
  addSpent,
  emptySpent,
  tokensUsed,
} from './budget';

export interface Branch {
  lane: string;
  prompt: string;
}

export interface BranchOut {
  lane: string;
  text: string;
  usage?: Usage | undefined;
  durationMs: number;
}

export type StopReason = 'none' | 'token-ceiling' | 'turn-budget' | 'wall-clock';

export interface FanOutResult {
  out: BranchOut[];
  spent: Spent;
  wallMs: number;
  stop: StopReason;
  failed: string[];
}

export type BranchRunner = (
  branch: Branch,
  signal: AbortSignal,
) => Promise<{ text: string; usage?: Usage }>;

/**
 * Оркестратор розгалуження Fan-Out / Fan-In з контролем 4-вимірного бюджету.
 */
export async function fanOut(opts: {
  runner: BranchRunner;
  rounds: Branch[][];
  budget: Budget;
  taskId: string;
}): Promise<FanOutResult> {
  const { budget, rounds, runner } = opts;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), budget.wallClockMs);
  const wall0 = performance.now();

  let spent = emptySpent();
  const out: BranchOut[] = [];
  const failed: string[] = [];
  let stop: StopReason = 'none';

  /**
   * Перевірка лімітів. Викликається і ПЕРЕД раундом, і ПІСЛЯ нього на fan-in.
   */
  const checkLimits = (nextBranchesCount: number): StopReason => {
    if (ac.signal.aborted) return 'wall-clock';
    if (spent.calls + nextBranchesCount > budget.maxTurns) return 'turn-budget';
    if (tokensUsed(spent) > budget.tokenCeiling) return 'token-ceiling';
    if (performance.now() - wall0 >= budget.wallClockMs) return 'wall-clock';
    return 'none';
  };

  try {
    for (const round of rounds) {
      // Обмежуємо кількість гілок у раунді за maxBranches
      const activeBranches = round.slice(0, budget.maxBranches);

      // Перевірка ПЕРЕД раундом
      const preStop = checkLimits(activeBranches.length);
      if (preStop !== 'none') {
        stop = preStop;
        break;
      }

      // Паралельний запуск гілок поточного раунду
      const branchPromises = activeBranches.map(async (branch) => {
        const t0 = performance.now();
        try {
          const res = await runner(branch, ac.signal);
          const durationMs = Math.round(performance.now() - t0);
          return {
            status: 'fulfilled' as const,
            lane: branch.lane,
            text: res.text,
            usage: res.usage,
            durationMs,
          };
        } catch (err) {
          const durationMs = Math.round(performance.now() - t0);
          return {
            status: 'rejected' as const,
            lane: branch.lane,
            error: err,
            durationMs,
          };
        }
      });

      const settled = await Promise.all(branchPromises);

      for (const res of settled) {
        if (res.status === 'fulfilled') {
          out.push({
            lane: res.lane,
            text: res.text,
            usage: res.usage,
            durationMs: res.durationMs,
          });
          spent = addSpent(spent, res.usage ?? {}, res.durationMs);
        } else {
          failed.push(res.lane);
          spent = addLostSpent(spent, res.durationMs);
        }
      }

      // Перевірка ПІСЛЯ раунду на FAN-IN (критично для стелі токенів та часу)
      const postStop = checkLimits(0);
      if (postStop !== 'none') {
        stop = postStop;
        break;
      }
    }
  } finally {
    clearTimeout(timer);
  }

  const wallMs = Math.round(performance.now() - wall0);
  return { out, spent, wallMs, stop, failed };
}
