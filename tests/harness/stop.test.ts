import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { budgetLimit, logStopEvent, stepLimit, toolLimit } from '../../scripts/harness/agent-stop';
import { CircuitBreaker } from '../../scripts/harness/circuit-breaker';
import { runStoppedTaskDemo } from '../../scripts/harness/run-stopped-task';

describe('Автоматичне зупинення (Крок 03)', () => {
  let tempDir: string;
  let breakerFile: string;
  let logFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'stop-test-'));
    breakerFile = join(tempDir, 'breaker.json');
    logFile = join(tempDir, 'stop-log.jsonl');
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('CircuitBreaker (автомат станів Фаулера)', () => {
    it('стартує у стані closed і дозволяє запуск задач', () => {
      const cb = new CircuitBreaker({ filePath: breakerFile, threshold: 3, cooldownMin: 15 });
      const res = cb.mayRun();
      expect(res.state).toBe('closed');
      expect(res.allow).toBe(true);
      expect(res.probe).toBe(false);
    });

    it('розмикається в open після N відмов підряд', () => {
      const cb = new CircuitBreaker({ filePath: breakerFile, threshold: 3, cooldownMin: 15 });
      cb.recordResult({ ok: false, tripReason: 'fail 1' });
      expect(cb.mayRun().state).toBe('closed');

      cb.recordResult({ ok: false, tripReason: 'fail 2' });
      expect(cb.mayRun().state).toBe('closed');

      cb.recordResult({ ok: false, tripReason: 'fail 3' });
      const check = cb.mayRun();
      expect(check.state).toBe('open');
      expect(check.allow).toBe(false);
      expect(check.why).toContain('open');
    });

    it('скидає лічильник відмов при успішному прогоні', () => {
      const cb = new CircuitBreaker({ filePath: breakerFile, threshold: 3, cooldownMin: 15 });
      cb.recordResult({ ok: false, tripReason: 'fail 1' });
      cb.recordResult({ ok: false, tripReason: 'fail 2' });
      cb.recordResult({ ok: true }); // успіх
      expect(cb.load().consecutiveFails).toBe(0);

      cb.recordResult({ ok: false, tripReason: 'fail 1 знову' });
      expect(cb.mayRun().state).toBe('closed');
    });

    it('миттєво розмикається в open при помилці 429 (Rate Limit)', () => {
      const cb = new CircuitBreaker({ filePath: breakerFile, threshold: 5 });
      cb.recordResult({ ok: false, isRateLimit429: true });
      const status = cb.mayRun();
      expect(status.state).toBe('open');
      expect(status.allow).toBe(false);
      expect(status.why).toContain('429');
    });

    it('миттєво розмикається в open при перевищенні бюджету', () => {
      const cb = new CircuitBreaker({ filePath: breakerFile, threshold: 5 });
      cb.recordResult({ ok: false, budgetExceeded: true, tripReason: '$0.05 > $0.01' });
      const status = cb.mayRun();
      expect(status.state).toBe('open');
      expect(status.allow).toBe(false);
      expect(status.why).toContain('бюджет');
    });

    it('переходить у half-open після завершення cooldownMin і закривається при успіху проби', () => {
      const cb = new CircuitBreaker({ filePath: breakerFile, threshold: 1, cooldownMin: 0.001 }); // дуже малий кулдаун
      cb.recordResult({ ok: false, tripReason: 'fail' });
      expect(cb.load().state).toBe('open');

      // Імітуємо очікування завершення кулдауну
      const data = cb.load();
      data.openedAt = new Date(Date.now() - 60000).toISOString(); // 1 хв тому
      cb.save(data);

      const check = cb.mayRun();
      expect(check.state).toBe('half-open');
      expect(check.allow).toBe(true);
      expect(check.probe).toBe(true);

      // Успіх пробної задачі закриває брейкер назад у closed
      cb.recordResult({ ok: true });
      expect(cb.load().state).toBe('closed');
      expect(cb.mayRun().allow).toBe(true);
    });

    it('у half-open одна невдача негайно повертає стан у open', () => {
      const cb = new CircuitBreaker({ filePath: breakerFile, threshold: 1, cooldownMin: 0.001 });
      const data = cb.load();
      data.state = 'half-open';
      cb.save(data);

      cb.recordResult({ ok: false, tripReason: 'проба провалилася' });
      expect(cb.load().state).toBe('open');
      expect(cb.mayRun().allow).toBe(false);
    });
  });

  describe('Agent Stop Helpers (stopWhen обмежувачі)', () => {
    it('stepLimit зупиняє цикл на N-му кроці та записує лог', async () => {
      const hook = stepLimit(3, 'task-test', logFile);
      const s = { toolCalls: [] } as any;
      expect(Boolean(hook({ steps: [s] } as any))).toBe(false);
      expect(Boolean(hook({ steps: [s, s] } as any))).toBe(false);
      expect(Boolean(hook({ steps: [s, s, s] } as any))).toBe(true);

      await new Promise((r) => setTimeout(r, 50));
      expect(existsSync(logFile)).toBe(true);
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('task-test');
      expect(content).toContain('isStepCount');
    });

    it('toolLimit зупиняє цикл при виклику цільового інструмента', async () => {
      const hook = toolLimit('submitArtifact', 'task-test', logFile);
      const stepWithTool = { toolCalls: [{ toolName: 'submitArtifact' }] } as any;
      const res = hook({ steps: [stepWithTool] } as any);
      expect(Boolean(res)).toBe(true);

      await new Promise((r) => setTimeout(r, 50));
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('submitArtifact');
    });

    it('budgetLimit зупиняє прогін при досягненні ліміту вартості', () => {
      let cost = 0.002;
      const check = budgetLimit(0.005, () => cost, 'task-test', logFile);
      expect(check()).toBe(false);

      cost = 0.006;
      expect(check()).toBe(true);
      const content = readFileSync(logFile, 'utf8');
      expect(content).toContain('maxBudgetUsd');
    });
  });

  describe('Демонстрація runStoppedTaskDemo', () => {
    it('виконує повний цикл і зупиняє прогін за лімітом', async () => {
      const demo = await runStoppedTaskDemo(logFile, breakerFile);
      expect(demo.check1.allow).toBe(true);
      expect(demo.breakerState).toBe('open');
      expect(demo.checkBlocked.allow).toBe(false);
      expect(existsSync(logFile)).toBe(true);
    });
  });
});
