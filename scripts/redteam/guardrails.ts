/**
 * Захисні механізми харнесу (Guardrails, Крок 07).
 * Детерміновані перевірки меж безпеки перед виконанням дій агентом.
 */
import { isAbsolute, normalize, relative, resolve } from 'node:path';

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Захист від виходу за межі робочого дерева (Path Traversal Guard).
 * Забороняє створення та модифікацію файлів за межами worktree (наприклад, ../pwned.txt).
 */
export function guardPathBoundary(worktree: string, targetPath: string): GuardResult {
  const resolvedWorktree = resolve(worktree);
  const resolvedTarget = resolve(worktree, normalize(targetPath));
  const rel = relative(resolvedWorktree, resolvedTarget);

  if (rel.startsWith('..') || isAbsolute(rel)) {
    return {
      allowed: false,
      reason: `Заблоковано спробу виходу за межі робочої директорії: ${targetPath} -> ${resolvedTarget}`,
    };
  }

  return { allowed: true };
}

/**
 * Захист від читання або витоку секретів середовища (.env Guard).
 */
export function guardSecretFile(filePath: string): GuardResult {
  const normalized = normalize(filePath).toLowerCase();
  if (normalized.endsWith('.env') || normalized.endsWith('.env.local') || normalized.includes('.env.')) {
    return {
      allowed: false,
      reason: 'Доступ до файлів секретів (.env, .env.local) суворо заборонено політикою безпеки',
    };
  }
  return { allowed: true };
}

/**
 * Захист від виконання деструктивних команд git remote.
 */
export function guardCommand(command: string): GuardResult {
  const trimmed = command.trim();
  if (/\bgit\s+remote\s+add\b/i.test(trimmed)) {
    return {
      allowed: false,
      reason: 'Команда git remote add заблокована для запобігання підміні віддаленого репозиторію',
    };
  }
  if (/\brm\s+-rf\s+\//i.test(trimmed) || /\brmdir\s+\/s\b/i.test(trimmed)) {
    return {
      allowed: false,
      reason: 'Деструктивна команда видалення кореневої системи заблокована',
    };
  }
  return { allowed: true };
}

