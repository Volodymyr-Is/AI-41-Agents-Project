/**
 * Прогін банку задач: k спроб на задачу, кожна — у новому git worktree.
 * Пише docs/lab3/evals.jsonl (одна спроба = один рядок) і друкує зведення.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  claudeRunner,
  geminiRunner,
  openRouterRunner,
  runTask,
  type AgentRunner,
  type Task,
} from '../harness/run-task';
import { grade } from './graders';

export interface EvalSummaryItem {
  readonly bucket: string;
  readonly tasks: number;
  readonly pass_at_k: number;
  readonly pass_pow_k: number;
}

/** pass@k — хоч одна спроба з k; pass^k — усі k спроб. */
export function summarize(
  lines: readonly { readonly task_id: string; readonly bucket: string; readonly pass: boolean }[],
  k: number
): EvalSummaryItem[] {
  const byTask = new Map<string, { bucket: string; ok: number; n: number }>();
  for (const l of lines) {
    const cur = byTask.get(l.task_id) ?? { bucket: l.bucket, ok: 0, n: 0 };
    byTask.set(l.task_id, { bucket: cur.bucket, ok: cur.ok + (l.pass ? 1 : 0), n: cur.n + 1 });
  }

  const buckets = new Map<string, { tasks: number; at_k: number; pow_k: number }>();
  for (const { bucket, ok, n } of byTask.values()) {
    const b = buckets.get(bucket) ?? { tasks: 0, at_k: 0, pow_k: 0 };
    buckets.set(bucket, {
      tasks: b.tasks + 1,
      at_k: b.at_k + (ok >= 1 ? 1 : 0),
      pow_k: b.pow_k + (ok === n && n === k ? 1 : 0),
    });
  }

  return [...buckets].map(([bucket, b]) => ({
    bucket,
    tasks: b.tasks,
    pass_at_k: b.tasks > 0 ? b.at_k / b.tasks : 0,
    pass_pow_k: b.tasks > 0 ? b.pow_k / b.tasks : 0,
  }));
}

export function pickRunner(): { runner: AgentRunner; agentPath: string } {
  if (process.env.GEMINI_API_KEY) {
    return { runner: geminiRunner, agentPath: 'gemini-cli' };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { runner: openRouterRunner, agentPath: 'openrouter-agent' };
  }
  return { runner: claudeRunner, agentPath: 'claude-code' };
}

export async function runEvals(options?: {
  bankFile?: string;
  logFile?: string;
  k?: number;
  bucket?: string;
  runner?: AgentRunner;
  agentPath?: string;
  dryRun?: boolean;
}) {
  const K = options?.k ?? Number(process.env.EVAL_K ?? 3);
  const ONLY = options?.bucket ?? process.env.EVAL_BUCKET ?? '';
  const BANK = options?.bankFile ?? process.argv[2] ?? 'docs/lab3/tasks.jsonl';
  const LOG = options?.logFile ?? 'docs/lab3/evals.jsonl';

  mkdirSync(dirname(LOG), { recursive: true });

  const git = (args: string[], cwd = '.') => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const SHA = (() => {
    try {
      return git(['rev-parse', '--short', 'HEAD']).trim();
    } catch {
      return 'local-dev';
    }
  })();

  const raw = readFileSync(BANK, 'utf8').replace(/^\ufeff/, '');
  const tasks: Task[] = raw
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Task)
    .filter((t) => ONLY === '' || t.bucket === ONLY);

  console.log(`=== Запуск Evals (задач: ${tasks.length}, k: ${K}, кошик: "${ONLY || 'всі'}") ===`);

  const read = (dir: string, name: string) => {
    try {
      return readFileSync(join(dir, name), 'utf8');
    } catch {
      return '';
    }
  };

  const { runner, agentPath } = options?.runner
    ? { runner: options.runner, agentPath: options.agentPath ?? 'mock' }
    : pickRunner();

  const generatedLines: any[] = [];

  for (const [index, task] of tasks.entries()) {
    console.log(`[${index + 1}/${tasks.length}] Задача ${task.id} (${task.bucket})...`);

    for (let attempt = 1; attempt <= K; attempt += 1) {
      if (options?.dryRun) {
        // Симуляція для швидкої перевірки / тестів
        const pass = task.bucket !== 'edge';
        const line = {
          task_id: task.id,
          bucket: task.bucket ?? 'regression',
          frozen_at: task.frozen_at ?? '2026-10-29',
          attempt,
          sha: SHA,
          pass,
          graders: [{ id: 'acceptance', pass, detail: pass ? 'усі команди 0' : 'імітація' }],
          duration_s: 1.2,
          input_tokens: 250,
          output_tokens: 180,
          cost_usd_estimate: 0,
          exit_status: pass ? 'ok' : 'fail',
          trace_id: null,
          at: new Date().toISOString(),
        };
        appendFileSync(LOG, `${JSON.stringify(line)}\n`);
        generatedLines.push(line);
        continue;
      }

      // Реальний запуск у чистому git worktree
      const branch = `eval/${task.id}-${attempt}-${Date.now()}`;
      const tree = join('..', 'eval-runs', `${task.id}-${attempt}`);
      try {
        git(['worktree', 'add', '-b', branch, tree, 'main']);
      } catch {
        // Якщо worktree не створюється (наприклад у вкладеному git середовищі), очищуємо й пробуємо знову
        try {
          git(['worktree', 'prune']);
          git(['worktree', 'add', '-b', branch, tree, 'main']);
        } catch (e) {
          console.warn(`Помилка worktree add: ${String(e)}`);
        }
      }

      try {
        const rec = runTask(task, {
          runner,
          agentPath,
          worktree: tree,
          outDir: 'runs',
        });

        const results = grade({
          task,
          patch: read(rec.artifact_dir, 'patch.diff'),
          output: read(rec.artifact_dir, 'output.txt'),
          acceptance: rec.acceptance,
        });

        const pass = results.length > 0 && results.every((r) => r.pass);

        const line = {
          task_id: task.id,
          bucket: task.bucket ?? 'regression',
          frozen_at: task.frozen_at ?? '2026-10-29',
          attempt,
          sha: SHA,
          pass,
          graders: results,
          duration_s: rec.duration_s,
          input_tokens: rec.input_tokens,
          output_tokens: rec.output_tokens,
          cost_usd_estimate: rec.cost_usd_estimate,
          exit_status: rec.exit_status,
          trace_id: rec.trace_id,
          at: new Date().toISOString(),
        };

        appendFileSync(LOG, `${JSON.stringify(line)}\n`);
        generatedLines.push(line);
      } finally {
        try {
          git(['worktree', 'remove', tree, '--force']);
        } catch {}
        try {
          git(['branch', '-D', branch]);
        } catch {}
      }
    }
  }

  const summary = summarize(generatedLines, K);
  console.log('\n=== Зведення Evals ===');
  for (const s of summary) {
    console.log(
      `Кошик [${s.bucket}]: задач=${s.tasks}, pass@${K}=${(s.pass_at_k * 100).toFixed(1)}%, pass^${K}=${(s.pass_pow_k * 100).toFixed(1)}%`
    );
  }

  return { generatedLines, summary };
}

if (process.argv[1]?.includes('run-evals')) {
  runEvals().catch(console.error);
}

