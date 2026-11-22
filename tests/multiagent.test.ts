import { describe, expect, it } from 'vitest';
import {
  createReader,
  runMultiAgentAnalysis,
  synthesizeReport,
  verifySynthesis,
} from '../src/multiagent/analyzer';
import {
  type Budget,
  addLostSpent,
  addSpent,
  emptySpent,
  tokensUsed,
} from '../src/multiagent/budget';
import { type Branch, fanOut } from '../src/multiagent/fanout';

describe('Мультиагентна функціональність із бюджетом (Крок 03 · Лабораторна 4)', () => {
  describe('Модуль бюджету (budget.ts)', () => {
    it('emptySpent ініціалізує нульові лічильники', () => {
      const s = emptySpent();
      expect(s.calls).toBe(0);
      expect(s.input).toBe(0);
      expect(s.output).toBe(0);
      expect(s.unreported).toBe(0);
      expect(s.ms).toBe(0);
      expect(tokensUsed(s)).toBe(0);
    });

    it('addSpent коректно додає токени та час', () => {
      const s0 = emptySpent();
      const s1 = addSpent(s0, { inputTokens: 100, outputTokens: 50 }, 25);
      expect(s1.calls).toBe(1);
      expect(s1.input).toBe(100);
      expect(s1.output).toBe(50);
      expect(s1.unreported).toBe(0);
      expect(s1.ms).toBe(25);
      expect(tokensUsed(s1)).toBe(150);
    });

    it('addSpent фіксує неповідомлені токени окремо (unreported)', () => {
      const s0 = emptySpent();
      const s1 = addSpent(s0, {}, 30);
      expect(s1.calls).toBe(1);
      expect(s1.input).toBe(0);
      expect(s1.output).toBe(0);
      expect(s1.unreported).toBe(1);
      expect(s1.ms).toBe(30);
    });

    it('addLostSpent фіксує витрачений хід для скасованої/впалої гілки', () => {
      const s0 = emptySpent();
      const s1 = addLostSpent(s0, 50);
      expect(s1.calls).toBe(1);
      expect(s1.unreported).toBe(1);
      expect(s1.ms).toBe(50);
    });
  });

  describe('Оркестратор розгалуження (fanOut)', () => {
    const standardBudget: Budget = {
      maxBranches: 4,
      maxTurns: 10,
      stepsPerBranch: 4,
      tokenCeiling: 10000,
      wallClockMs: 2000,
    };

    it('виконує паралельний раунд читання та повертає виходи всіх гілок', async () => {
      const runner = createReader({
        history: 'commits info',
        deps: 'dependencies info',
      });

      const res = await fanOut({
        runner,
        rounds: [
          [
            { lane: 'history', prompt: 'test prompt' },
            { lane: 'deps', prompt: 'test prompt' },
          ],
        ],
        budget: standardBudget,
        taskId: 'test-1',
      });

      expect(res.stop).toBe('none');
      expect(res.out.length).toBe(2);
      expect(res.out.map((o) => o.lane)).toEqual(['history', 'deps']);
      expect(res.spent.calls).toBe(2);
      expect(res.failed.length).toBe(0);
    });

    it('зупиняє виконання по стелі ходів (turn-budget) до старту раунду', async () => {
      const runner = createReader({ lane1: 'ok', lane2: 'ok' });

      const tightBudget: Budget = {
        ...standardBudget,
        maxTurns: 1, // дозволено лише 1 хід, а раунд просить 2
      };

      const res = await fanOut({
        runner,
        rounds: [
          [
            { lane: 'lane1', prompt: 'p1' },
            { lane: 'lane2', prompt: 'p2' },
          ],
        ],
        budget: tightBudget,
        taskId: 'test-turn-budget',
      });

      expect(res.stop).toBe('turn-budget');
      expect(res.out.length).toBe(0);
    });

    it('зупиняє виконання по стелі токенів (token-ceiling) на fan-in', async () => {
      // Раннер, що повертає велику кількість токенів
      const tokenHeavyRunner = async (b: Branch) => ({
        text: 'huge payload',
        usage: { inputTokens: 400, outputTokens: 400, totalTokens: 800 },
      });

      const lowTokenBudget: Budget = {
        ...standardBudget,
        maxTurns: 10,
        tokenCeiling: 500, // стеля нижча за вихід раунду (800)
      };

      const res = await fanOut({
        runner: tokenHeavyRunner,
        rounds: [
          [{ lane: 'lane1', prompt: 'p1' }],
          [{ lane: 'lane2', prompt: 'p2' }], // цей раунд не повинен стартувати
        ],
        budget: lowTokenBudget,
        taskId: 'test-token-ceiling',
      });

      expect(res.stop).toBe('token-ceiling');
      expect(res.out.length).toBe(1); // лише перший раунд виконав вихід
    });

    it('зупиняє виконання по таймауту (wall-clock)', async () => {
      const slowRunner = async (_b: Branch, signal: AbortSignal) => {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 300);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new Error('Aborted'));
          });
        });
        return { text: 'slow' };
      };

      const timeoutBudget: Budget = {
        ...standardBudget,
        wallClockMs: 50, // дуже короткий таймаут
      };

      const res = await fanOut({
        runner: slowRunner,
        rounds: [[{ lane: 'lane1', prompt: 'p1' }]],
        budget: timeoutBudget,
        taskId: 'test-wall-clock',
      });

      expect(res.failed.length).toBe(1);
    });
  });

  describe('Звідник та Верифікатор на fan-in (analyzer.ts)', () => {
    it('synthesizeReport зводить результати гілок у структурований звіт', () => {
      const draft = synthesizeReport(
        { id: 'q1', question: 'Як працює модуль?', targetModule: 'src/index.ts' },
        [
          { lane: 'history', text: '15 комітів', durationMs: 10 },
          { lane: 'deps', text: '0 залежностей', durationMs: 12 },
        ],
      );

      expect(draft.findings.length).toBe(2);
      expect(draft.summary).toContain('src/index.ts');
    });

    it('verifySynthesis схвалює звід за наявності всіх обовʼязкових смуг', () => {
      const draft = {
        summary: 'Огляд',
        findings: [
          { lane: 'history', detail: '...' },
          { lane: 'deps', detail: '...' },
        ],
      };

      const verdict = verifySynthesis(draft, ['history', 'deps']);
      expect(verdict.passed).toBe(true);
      expect(verdict.score).toBe(1.0);
    });

    it('verifySynthesis блокує звід (fail-closed), якщо відсутня обовʼязкова смуга', () => {
      const draft = {
        summary: 'Неповний огляд',
        findings: [{ lane: 'history', detail: '...' }],
      };

      const verdict = verifySynthesis(draft, ['history', 'deps']);
      expect(verdict.passed).toBe(false);
      expect(verdict.score).toBe(0.5);
      expect(verdict.reason).toContain('deps');
    });

    it('runMultiAgentAnalysis виконує повний ланцюг та повертає схвалений звіт', async () => {
      const budget: Budget = {
        maxBranches: 4,
        maxTurns: 10,
        stepsPerBranch: 4,
        tokenCeiling: 10000,
        wallClockMs: 3000,
      };

      const report = await runMultiAgentAnalysis({
        query: { id: 'q-full', question: 'Тестове питання', targetModule: 'src/index.ts' },
        budget,
        readerData: {
          history: 'history content',
          deps: 'deps content',
          code: 'code content',
          tests: 'tests content',
        },
      });

      expect(report.verified).toBe(true);
      expect(report.findings.length).toBe(4);
      expect(report.spent.calls).toBe(5); // 4 гілки + 1 верифікатор
      expect(report.stopReason).toBe('none');
    });
  });
});
