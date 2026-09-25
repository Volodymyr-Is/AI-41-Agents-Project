// Hook заборони читання і редагування .env / .env.local
// Виклик: node scripts/guard-env.mjs <source>
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [source = 'unknown'] = process.argv.slice(2);
let event = {};
try {
  event = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  event = {};
}

const tool = event.tool_name ?? event.toolName ?? event.toolCall?.name ?? '';
let args = event.tool_input ?? event.toolArgs ?? event.toolCall?.args ?? {};
if (typeof args === 'string') {
  try {
    args = JSON.parse(args);
  } catch {
    args = {};
  }
}

const checkPattern = (str) => {
  if (typeof str !== 'string') return false;
  return /(^|[/\\])\.env(\.local)?($|[/\\]|\s|'|")/i.test(str) || /\.env(\.local)?$/i.test(str);
};

let blocked = false;
let target = '';

// Перевірка шляхів файлів
for (const key of ['file_path', 'filePath', 'path', 'AbsolutePath', 'SearchPath', 'TargetFile']) {
  if (checkPattern(args[key])) {
    blocked = true;
    target = args[key];
    break;
  }
}

// Перевірка команд
for (const key of ['command', 'CommandLine']) {
  if (checkPattern(args[key])) {
    blocked = true;
    target = args[key];
    break;
  }
}

// Перевірка патчів
if (tool === 'apply_patch') {
  const patch = Array.isArray(args.command) ? args.command.join('\n') : String(args.command ?? '');
  if (checkPattern(patch)) {
    blocked = true;
    target = '.env / .env.local';
  }
}

const rootDir = process.env.CLAUDE_PROJECT_DIR ?? event.workspacePaths?.[0] ?? (process.cwd().endsWith('.agents') ? join(process.cwd(), '..') : process.cwd());
const dir = join(rootDir, '.agent-log');

if (blocked) {
  // Записуємо рядок denied в журнал дій (вимога Кроку 02/05)
  mkdirSync(dir, { recursive: true });
  const session = event.session_id ?? event.sessionId ?? event.conversationId ?? 'unknown';
  const row = {
    ts: new Date().toISOString(),
    tool,
    input: { target: String(target).slice(0, 200) },
    result: 'denied',
    session,
    source
  };
  appendFileSync(join(dir, `${source}.jsonl`), `${JSON.stringify(row)}\n`);

  const reason = 'Політика курсу: .env і .env.local редагує/читає виключно людина.';

  if (source === 'antigravity') {
    // Формат Antigravity PreToolUse блокування
    process.stdout.write(JSON.stringify({
      decision: 'deny',
      reason
    }) + '\n');
    process.exit(0);
  } else {
    // Формат Codex / Claude Code PreToolUse блокування (вихід з ненульовим кодом або JSON)
    process.stderr.write(reason + '\n');
    process.exit(2);
  }
}

// Якщо дія дозволена
if (source === 'antigravity') {
  process.stdout.write(JSON.stringify({ decision: 'allow' }) + '\n');
}
process.exit(0);
