/**
 * Черга фабрики задач: одна задача або всі.
 * Готує git worktree й прибирає після себе.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { claudeRunner, geminiRunner, openRouterRunner, runTask, type AgentRunner, type Task } from './run-task';

const file = process.argv[2] ?? 'docs/lab3/tasks.jsonl';
const onlyId = process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : null;
const runnerArg = process.argv.includes('--runner') ? process.argv[process.argv.indexOf('--runner') + 1] : null;

// Вибір раннера: якщо явно задано --runner openrouter або є OPENROUTER_API_KEY — використовуємо OpenRouter
let selectedRunner: AgentRunner = geminiRunner;
let agentPath = 'gemini-cli';

if (runnerArg === 'openrouter' || (!runnerArg && process.env.OPENROUTER_API_KEY)) {
  selectedRunner = openRouterRunner;
  agentPath = 'openrouter-agent';
} else if (runnerArg === 'claude') {
  selectedRunner = claudeRunner;
  agentPath = 'claude-code';
}

const tasks: Task[] = readFileSync(file, 'utf8')
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/)
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as Task)
  .filter((t) => onlyId === null || t.id === onlyId);

if (tasks.length === 0) {
  throw new Error(`у ${file} немає задач${onlyId ? ` з id ${onlyId}` : ''}`);
}

const git = (args: string[], cwd = '.') => execFileSync('git', args, { cwd, encoding: 'utf8' });


for (const task of tasks) {
  const branch = `harness/${task.id}`;
  const tree = join('..', 'harness-runs', task.id);

  // Очищаємо залишки старого дерева, якщо воно залишилося від аварійного завершення
  try {
    git(['worktree', 'remove', tree, '--force']);
  } catch {
    // Якщо дерева ще не існувало — ігноруємо
  }
  try {
    git(['worktree', 'prune']);
  } catch {
    // Ігноруємо помилки prune
  }

  // Створюємо ізольоване дерево (-B скидає гілку на main)
  git(['worktree', 'add', '-B', branch, tree, 'main']);

  try {
    const rec = runTask(task, {
      runner: selectedRunner,
      agentPath,
      worktree: tree,
      outDir: 'runs',
    });

    // Артефакт — у репозиторій; сира runs/ лишається в .gitignore
    const keep = join('docs', 'lab3', 'runs', `${task.id}-${new Date(rec.started_at).getTime()}`);
    mkdirSync(join('docs', 'lab3', 'runs'), { recursive: true });
    cpSync(rec.artifact_dir, keep, { recursive: true, force: true });

    // Гілку відправляємо для перевірки брамами (якщо є зміни)
    try {
      git(['add', '-A'], tree);
      git(['commit', '-m', `harness: ${task.id}`], tree);
      git(['push', '-u', 'origin', branch], tree);
    } catch {
      // Якщо змін не було або push не пройшов — це очікувано
    }

    console.log(`${task.id}: ${rec.exit_status}, acceptance ${rec.acceptance_passed ? 'pass' : 'fail'} → ${keep}`);
  } catch (err) {
    console.error(`ПОМИЛКА при виконанні задачі ${task.id}:`, err);
  } finally {
    try {
      git(['worktree', 'remove', tree, '--force']);
    } catch {
      // Ігноруємо помилки видалення у finally
    }
  }
}




