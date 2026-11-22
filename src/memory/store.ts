import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  MemoryEntry,
  MemoryEntrySchema,
  MemoryReadOptions,
  MemoryReadResult,
  MemoryRepo,
} from './schema';

export const DEFAULT_STORE_PATH = path.resolve(process.cwd(), 'docs/lab4/memory/store.jsonl');

/**
 * Стандартне визначення шляху до репозиторію.
 */
export function defaultRepoPathResolver(repo: MemoryRepo): string {
  if (repo === 'course') {
    return process.cwd();
  }
  // Перевіряємо розташування форку ms відносно поточного робочого каталогу
  const candidatePaths = [
    path.resolve(process.cwd(), '../ms'),
    path.resolve(process.cwd(), '../../ms'),
    'C:\\Users\\volod\\OneDrive\\Документи\\GitHub\\ms',
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return path.resolve(process.cwd(), '../ms');
}

/**
 * Перевірка застарілості запису через git log <sha>..HEAD -- <path>.
 * Якщо між зафіксованим SHA і HEAD були коміти у вказаних шляхах, або якщо git завершився з помилкою — запис вважається застарілим.
 */
export function isRecordStale(
  entry: MemoryEntry,
  repoPathResolver: (repo: MemoryRepo) => string = defaultRepoPathResolver
): boolean {
  const repoDir = repoPathResolver(entry.repo);
  if (!fs.existsSync(repoDir)) {
    return true; // Якщо репозиторій недоступний, вважаємо застарілим
  }

  for (const relPath of entry.paths) {
    try {
      const output = execFileSync(
        'git',
        ['log', '--format=%H', `${entry.sha}..HEAD`, '--', relPath],
        {
          cwd: repoDir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 3000,
        }
      ).trim();

      if (output.length > 0) {
        // Є коміти після SHA, що змінювали цей файл
        return true;
      }
    } catch {
      // Помилка git (наприклад, невідомий SHA або файл видалено) -> позначаємо застарілим
      return true;
    }
  }

  return false;
}

/**
 * Детермінований append-only запис у сховище пам'яті.
 */
export function appendMemoryEntry(
  rawEntry: unknown,
  storePath: string = DEFAULT_STORE_PATH
): MemoryEntry {
  const parsed = MemoryEntrySchema.parse(rawEntry);
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify(parsed) + '\n';
  fs.appendFileSync(storePath, line, 'utf-8');
  return parsed;
}

/**
 * Читання пам'яті з обмеженням розміру контексту (K записів, B байтів)
 * та перевіркою застарілості (staleness check).
 */
export function readMemoryEntries(
  options: MemoryReadOptions = {},
  storePath: string = DEFAULT_STORE_PATH
): MemoryReadResult {
  const {
    maxEntries = Infinity,
    maxBytes = Infinity,
    filterStale = true,
    repoPathResolver = defaultRepoPathResolver,
  } = options;

  if (!fs.existsSync(storePath)) {
    return {
      entries: [],
      totalStored: 0,
      returnedCount: 0,
      truncatedBytes: 0,
      staleCount: 0,
      summary: 'Store file does not exist. Read 0 of 0 entries.',
    };
  }

  const content = fs.readFileSync(storePath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const totalStored = lines.length;

  const validEntries: (MemoryEntry & { stale?: boolean })[] = [];
  let staleCount = 0;

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const parsed = MemoryEntrySchema.parse(obj);
      const stale = isRecordStale(parsed, repoPathResolver);
      if (stale) {
        staleCount++;
      }
      if (filterStale && stale) {
        continue;
      }
      validEntries.push({ ...parsed, stale });
    } catch {
      // Ігноруємо некоректні рядки
    }
  }

  // Застосування ліміту K записів (беремо найновіші, якщо перевищує maxEntries)
  const candidateEntries = validEntries.slice(-maxEntries);

  // Застосування ліміту B байтів
  const returnedEntries: (MemoryEntry & { stale?: boolean })[] = [];
  let currentBytes = 0;
  let truncatedBytes = 0;

  for (const entry of candidateEntries) {
    const entryJson = JSON.stringify(entry);
    const entryBytes = Buffer.byteLength(entryJson, 'utf-8');

    if (currentBytes + entryBytes <= maxBytes) {
      returnedEntries.push(entry);
      currentBytes += entryBytes;
    } else {
      truncatedBytes += entryBytes;
    }
  }

  const summary = `Read ${returnedEntries.length} of ${totalStored} stored entries (${staleCount} stale${filterStale ? ' omitted' : ''}, truncated ${truncatedBytes} bytes).`;

  return {
    entries: returnedEntries,
    totalStored,
    returnedCount: returnedEntries.length,
    truncatedBytes,
    staleCount,
    summary,
  };
}
