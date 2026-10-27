/**
 * Виконавець фабрики задач (крок 00).
 * Один виклик = одна задача = один артефакт + один журнал прогону.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export interface Task {
  readonly id: string;
  readonly input: string;
  readonly acceptance: readonly string[];
  readonly budget: {
    readonly max_turns: number;
    readonly max_usd: number;
    readonly timeout_s: number;
  };
  readonly files?: readonly string[];
}

export interface AgentResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** true, якщо процес убив таймаут, а не агент завершився сам */
  readonly timedOut: boolean;
}

/** Запуск агента. У тестах підмінюється підставним. */
export type AgentRunner = (task: Task, cwd: string) => AgentResult;

export interface RunRecord {
  readonly task_id: string;
  readonly agent_path: string;
  readonly artifact_dir: string;
  readonly started_at: string;
  readonly ended_at: string;
  readonly duration_s: number;
  readonly exit_status: 'ok' | 'agent_failed' | 'timeout' | 'budget_or_turns';
  readonly acceptance: readonly { readonly cmd: string; readonly exit: number }[];
  readonly acceptance_passed: boolean;
  readonly session_id: string | null;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly cost_usd_estimate: number | null;
  readonly trace_id: string | null; // крок 06
  readonly gates: Record<string, 'pass' | 'fail' | 'skipped'>; // крок 01
}

/** Спільна обвʼязка процесу: таймаут задачі тримає сам процес. */
export function spawnAgent(bin: string, args: readonly string[], cwd: string, timeoutS: number): AgentResult {
  const r = spawnSync(bin, [...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    timeout: timeoutS * 1000,
    killSignal: 'SIGINT',
    shell: process.platform === 'win32',
  });
  return {
    exitCode: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    timedOut: r.error !== undefined && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT',
  };
}

/** Безкоштовний шлях: Gemini CLI. -p вимушує неінтерактивний режим. */
export const geminiRunner: AgentRunner = (task, cwd) =>
  spawnAgent('gemini', ['-p', task.input, '-o', 'json'], cwd, task.budget.timeout_s);

/** Шлях через OpenRouter API (використовує openrouter-agent.ts з base64 для уникнення проблем з лапками в cmd). */
export const openRouterRunner: AgentRunner = (task, cwd) => {
  const agentScript = join(__dirname, 'openrouter-agent.ts');
  const b64 = Buffer.from(JSON.stringify(task), 'utf8').toString('base64');
  return spawnAgent('npx', ['tsx', agentScript, '--b64', b64], cwd, task.budget.timeout_s);
};


/** Платний шлях: Claude Code у режимі -p. Прапорці — рівно задокументовані. */
export const claudeRunner: AgentRunner = (task, cwd) => {
  const allowed = ['Read', 'Edit', 'Bash(npm test *)', 'Bash(npm run typecheck *)', 'Bash(git diff *)'].join(',');
  return spawnAgent(
    'claude',
    [
      '-p',
      task.input,
      '--output-format',
      'json',
      '--allowedTools',
      allowed,
      '--permission-mode',
      'dontAsk',
      '--max-turns',
      String(task.budget.max_turns),
      '--max-budget-usd',
      String(task.budget.max_usd),
    ],
    cwd,
    task.budget.timeout_s,
  );
};

/**
 * З --output-format json Claude Code дає session_id і total_cost_usd.
 */
export function readMeta(stdout: string) {
  const empty = { session_id: null, input_tokens: null, output_tokens: null, cost_usd_estimate: null };
  try {
    const j = JSON.parse(stdout) as Record<string, unknown>;
    const usage = (j.usage as Record<string, unknown>) ?? {};
    return {
      session_id: typeof j.session_id === 'string' ? j.session_id : null,
      input_tokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : null,
      output_tokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : null,
      cost_usd_estimate: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : null,
    };
  } catch {
    return empty;
  }
}

/** Критерії приймання — це КОМАНДИ. Виконуємо їх у дереві прогону. */
// export function checkAcceptance(task: Task, cwd: string) {
//   return task.acceptance.map((cmd) => {
//     const r = spawnSync(cmd, { cwd, encoding: 'utf8', shell: true, timeout: task.budget.timeout_s * 1000 });
//     return { cmd, exit: r.status ?? 1 };
//   });
// }

/** Критерії приймання — це КОМАНДИ. Виконуємо їх у дереві прогону. */
export function checkAcceptance(task: Task, cwd: string) {
  const rootModules = join(process.cwd(), 'node_modules');
  const rootBin = join(rootModules, '.bin');
  const sep = process.platform === 'win32' ? ';' : ':';
  return task.acceptance.map((cmd) => {
    const r = spawnSync(cmd, {
      cwd,
      encoding: 'utf8',
      shell: true,
      env: {
        ...process.env,
        NODE_PATH: rootModules,
        PATH: `${rootBin}${sep}${process.env.PATH ?? ''}`,
      },
      timeout: task.budget.timeout_s * 1000,
    });
    return { cmd, exit: r.status ?? 1 };
  });
}

export function runTask(
  task: Task,
  opts: {
    runner: AgentRunner;
    agentPath: string;
    worktree: string;
    outDir: string;
    check?: typeof checkAcceptance;
  },
): RunRecord {
  const dir = join(opts.outDir, `${task.id}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const started = new Date();
  const res = opts.runner(task, opts.worktree);

  // Артефакт: спершу git add -A, бо `git diff` без індексу НЕ показує нових файлів
  let patch = '';
  try {
    execFileSync('git', ['add', '-A'], { cwd: opts.worktree });
    patch = execFileSync('git', ['diff', '--cached'], { cwd: opts.worktree, encoding: 'utf8' });
  } catch {
    patch = '';
  }

  writeFileSync(join(dir, 'patch.diff'), patch, 'utf8');
  writeFileSync(join(dir, 'output.txt'), res.stdout, 'utf8');
  writeFileSync(join(dir, 'agent.log'), res.stderr, 'utf8');

  const acceptance = (opts.check ?? checkAcceptance)(task, opts.worktree);
  const ended = new Date();

  let exit_status: 'ok' | 'agent_failed' | 'timeout' | 'budget_or_turns' = 'ok';
  if (res.timedOut) {
    exit_status = 'timeout';
  } else if (res.stderr.includes('Budget limit reached') || res.stdout.includes('Budget limit reached')) {
    exit_status = 'budget_or_turns';
  } else if (res.exitCode !== 0) {
    exit_status = 'agent_failed';
  }

  const record: RunRecord = {
    task_id: task.id,
    agent_path: opts.agentPath,
    artifact_dir: dir,
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    duration_s: Math.round((ended.getTime() - started.getTime()) / 100) / 10,
    exit_status,
    acceptance,
    acceptance_passed: acceptance.length > 0 && acceptance.every((a) => a.exit === 0),
    ...readMeta(res.stdout),
    trace_id: null,
    gates: {},
  };

  writeFileSync(join(dir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}
