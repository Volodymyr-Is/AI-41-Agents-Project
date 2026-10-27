import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runTask, type AgentRunner, type Task } from '../../scripts/harness/run-task';

const task: Task = {
  id: 't-01',
  input: 'нічого не робити',
  acceptance: ['npm run typecheck'],
  budget: { max_turns: 2, max_usd: 0.01, timeout_s: 30 },
};

const fake = (exitCode: number, stdout = '', stderr = ''): AgentRunner => () => ({
  exitCode,
  stdout,
  stderr,
  timedOut: false,
});

const fakeTimeout = (): AgentRunner => () => ({
  exitCode: 1,
  stdout: '',
  stderr: 'ETIMEDOUT',
  timedOut: true,
});

const tmp = () => mkdtempSync(join(tmpdir(), 'harness-'));

describe('runTask', () => {
  it('пише журнал і артефакт на успішному прогоні', () => {
    const out = tmp();
    const fakeCheck = () => [{ cmd: 'npm run typecheck', exit: 0 }];
    const rec = runTask(task, {
      runner: fake(
        0,
        JSON.stringify({
          session_id: 'abc',
          total_cost_usd: 0.004,
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      ),
      agentPath: 'fake',
      worktree: tmp(),
      outDir: out,
      check: fakeCheck,
    });
    expect(rec.exit_status).toBe('ok');
    expect(rec.session_id).toBe('abc');
    expect(rec.cost_usd_estimate).toBe(0.004);
    expect(rec.input_tokens).toBe(10);
    expect(rec.output_tokens).toBe(5);
    expect(rec.acceptance_passed).toBe(true);
    // журнал мусить вказувати на свою ж теку артефакту
    expect(JSON.parse(readFileSync(join(rec.artifact_dir, 'run.json'), 'utf8')).task_id).toBe('t-01');
  });

  it('пише журнал навіть коли агент упав', () => {
    const rec = runTask(task, {
      runner: fake(1, '', 'boom'),
      agentPath: 'fake',
      worktree: tmp(),
      outDir: tmp(),
      check: () => [{ cmd: 'test', exit: 1 }],
    });
    expect(rec.exit_status).toBe('agent_failed');
    expect(readFileSync(join(rec.artifact_dir, 'agent.log'), 'utf8')).toContain('boom');
  });

  it('відрізняє вичерпаний бюджет від падіння', () => {
    const rec = runTask(task, {
      runner: fake(1, '', 'Budget limit reached'),
      agentPath: 'fake',
      worktree: tmp(),
      outDir: tmp(),
      check: () => [{ cmd: 'test', exit: 1 }],
    });
    expect(rec.exit_status).toBe('budget_or_turns');
  });

  it('відрізняє таймаут від падіння', () => {
    const rec = runTask(task, {
      runner: fakeTimeout(),
      agentPath: 'fake',
      worktree: tmp(),
      outDir: tmp(),
      check: () => [{ cmd: 'test', exit: 1 }],
    });
    expect(rec.exit_status).toBe('timeout');
  });

  it('не падає на непарсибельному виводі', () => {
    const rec = runTask(task, {
      runner: fake(0, 'не JSON'),
      agentPath: 'fake',
      worktree: tmp(),
      outDir: tmp(),
      check: () => [{ cmd: 'test', exit: 0 }],
    });
    expect(rec.cost_usd_estimate).toBeNull();
  });
});
