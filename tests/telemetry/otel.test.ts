import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyFailure, initTelemetry, runTaskTraced } from '../../scripts/telemetry/otel';
import type { Task, AgentRunner } from '../../scripts/harness/run-task';

describe('scripts/telemetry/otel', () => {
  it('initTelemetry успішно повертає tracer та sdk', () => {
    const { tracer, sdk } = initTelemetry();
    expect(tracer).toBeDefined();
    expect(sdk).toBeDefined();
  });

  it('runTaskTraced виконує задачу всередині спана та прокидає trace_id у run.json', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'otel-task-test-'));

    const mockTask: Task = {
      id: 't-test-otel',
      input: 'Тестова задача для перевірки телеметрії',
      acceptance: ['node -e "process.exit(0)"'],
      budget: { max_turns: 2, max_usd: 0.05, timeout_s: 10 },
    };

    const mockRunner: AgentRunner = (_task, _cwd) => ({
      exitCode: 0,
      stdout: 'Зроблено зміни',
      stderr: '',
      timedOut: false,
    });

    try {
      const rec = runTaskTraced(mockTask, {
        runner: mockRunner,
        agentPath: 'mock-agent',
        worktree: tempDir,
        outDir: join(tempDir, 'runs'),
      });

      expect(rec.task_id).toBe('t-test-otel');
      expect(rec.trace_id).toBeDefined();
      expect(typeof rec.trace_id).toBe('string');
      // OpenTelemetry trace_id — 32 символи hex (16 байтів)
      expect(rec.trace_id).toMatch(/^[0-9a-f]{32}$/);

      // Перевіряємо, що run.json містить заповнений trace_id, а не null
      const runJsonPath = join(rec.artifact_dir, 'run.json');
      const saved = JSON.parse(readFileSync(runJsonPath, 'utf8'));
      expect(saved.trace_id).toBe(rec.trace_id);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('classifyFailure (таксономія 5 причин)', () => {
    it('класифікує як harness при перевищенні таймауту або ліміту кроків', () => {
      const timeoutRes = classifyFailure({
        task_id: 't-01',
        exit_status: 'timeout',
        acceptance_passed: false,
        duration_s: 301,
        timedOut: true,
      });
      expect(timeoutRes.errorClass).toBe('harness');
      expect(timeoutRes.reason).toContain('Перевищено встановлений ліміт часу');

      const breakerRes = classifyFailure({
        task_id: 't-02',
        exit_status: 'agent_failed',
        acceptance_passed: false,
        duration_s: 1,
        isBreakerOpen: true,
      });
      expect(breakerRes.errorClass).toBe('harness');
      expect(breakerRes.reason).toContain('Circuit breaker');

      const stepLimitRes = classifyFailure({
        task_id: 't-03',
        exit_status: 'agent_failed',
        acceptance_passed: false,
        duration_s: 12,
        stepCount: 2,
      });
      expect(stepLimitRes.errorClass).toBe('harness');
      expect(stepLimitRes.reason).toContain('лімітом агентних кроків');
    });

    it('класифікує як task для шкідливих або відхилених задач', () => {
      const resRejected = classifyFailure({
        task_id: 't-rejected-01',
        exit_status: 'agent_failed',
        acceptance_passed: false,
        duration_s: 5,
      });
      expect(resRejected.errorClass).toBe('task');
      expect(resRejected.reason).toContain('Некоректна специфікація задачі');

      const resHarmful = classifyFailure({
        task_id: 't-19',
        exit_status: 'agent_failed',
        acceptance_passed: false,
        duration_s: 2,
      });
      expect(resHarmful.errorClass).toBe('task');
    });

    it('класифікує як tool при збої інструменту', () => {
      const res = classifyFailure({
        task_id: 't-06',
        exit_status: 'agent_failed',
        acceptance_passed: false,
        duration_s: 15,
        toolErrors: 2,
        errorMessage: 'EPERM: operation not permitted',
      });
      expect(res.errorClass).toBe('tool');
      expect(res.reason).toContain('Помилка виконання виклику інструменту');
    });

    it('класифікує як prompt коли diff порожній через брак контексту', () => {
      const res = classifyFailure({
        task_id: 't-17',
        exit_status: 'agent_failed',
        acceptance_passed: false,
        duration_s: 8,
        patchLength: 0,
      });
      expect(res.errorClass).toBe('prompt');
      expect(res.reason).toContain('Промпт не надав достатнього контексту');
    });

    it('класифікує як model при дефектах коду або завалених тестах', () => {
      const res = classifyFailure({
        task_id: 't-04',
        exit_status: 'agent_failed',
        acceptance_passed: false,
        duration_s: 22,
        patchLength: 450,
      });
      expect(res.errorClass).toBe('model');
      expect(res.reason).toContain('Модель згенерувала');
    });
  });
});

