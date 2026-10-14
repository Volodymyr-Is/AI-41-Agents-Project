import { describe, expect, it } from 'vitest';
import { runPool, type Budget } from '../scripts/parallel-eval';

describe('Parallel Evaluation Pool (Lab 2, Step 07)', () => {
  const defaultBudget: Budget = {
    maxBranches: 2,
    maxTokens: 10_000,
    maxWallMs: 5_000,
  };

  it('runs tasks sequentially when maxBranches = 1', async () => {
    const executionOrder: number[] = [];
    const tasks = [
      async () => {
        executionOrder.push(1);
        return 'res1';
      },
      async () => {
        executionOrder.push(2);
        return 'res2';
      },
      async () => {
        executionOrder.push(3);
        return 'res3';
      },
    ];

    const budget: Budget = { ...defaultBudget, maxBranches: 1 };
    const { results, stoppedEarly } = await runPool(tasks, budget, () => 0);

    expect(stoppedEarly).toBe(false);
    expect(results).toEqual(['res1', 'res2', 'res3']);
    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('runs tasks in parallel when maxBranches > 1', async () => {
    let activeWorkers = 0;
    let maxSimultaneous = 0;

    const tasks = Array.from({ length: 6 }, (_, i) => async () => {
      activeWorkers++;
      maxSimultaneous = Math.max(maxSimultaneous, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeWorkers--;
      return i;
    });

    const budget: Budget = { ...defaultBudget, maxBranches: 3 };
    const { results, stoppedEarly } = await runPool(tasks, budget, () => 0);

    expect(stoppedEarly).toBe(false);
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    expect(maxSimultaneous).toBeGreaterThanOrEqual(2);
    expect(maxSimultaneous).toBeLessThanOrEqual(3);
  });

  it('stops early when token budget is exceeded', async () => {
    let currentTokens = 0;
    const tasks = [
      async () => {
        currentTokens += 600;
        return 'task1';
      },
      async () => {
        currentTokens += 500;
        return 'task2';
      },
      async () => {
        currentTokens += 500;
        return 'task3';
      },
      async () => {
        currentTokens += 500;
        return 'task4';
      },
    ];

    const budget: Budget = {
      maxBranches: 1,
      maxTokens: 1000, // Budget exceeded after task 2
      maxWallMs: 5000,
    };

    const { results, stoppedEarly } = await runPool(tasks, budget, () => currentTokens);

    expect(stoppedEarly).toBe(true);
    expect(results[0]).toBe('task1');
    expect(results[1]).toBe('task2');
    // Task 3 and 4 should not have been started
    expect(results[2]).toBeUndefined();
    expect(results[3]).toBeUndefined();
  });

  it('isolates errors so a failed task does not crash other branches', async () => {
    const tasks = [
      async () => 'success1',
      async () => {
        throw new Error('Branch API error 429');
      },
      async () => 'success2',
    ];

    const { results, stoppedEarly } = await runPool(tasks, defaultBudget, () => 0);

    expect(stoppedEarly).toBe(false);
    expect(results[0]).toBe('success1');
    expect(results[1]).toBeInstanceOf(Error);
    expect((results[1] as Error).message).toBe('Branch API error 429');
    expect(results[2]).toBe('success2');
  });

  it('stops early when wall-clock time limit is exceeded', async () => {
    const tasks = [
      async () => {
        await new Promise((r) => setTimeout(r, 40));
        return 't1';
      },
      async () => {
        await new Promise((r) => setTimeout(r, 40));
        return 't2';
      },
      async () => {
        await new Promise((r) => setTimeout(r, 40));
        return 't3';
      },
    ];

    const budget: Budget = {
      maxBranches: 1,
      maxTokens: 100_000,
      maxWallMs: 30, // Too small to finish all tasks
    };

    const { stoppedEarly } = await runPool(tasks, budget, () => 0);
    expect(stoppedEarly).toBe(true);
  });
});
