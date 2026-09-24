// Hook журналу для інструментів без jq: читає JSON події зі stdin і дописує
// один рядок формату курсу в .agent-log/<source>.jsonl.
// Виклик: node scripts/agent-log-hook.mjs <source> [result]
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [source = 'unknown', result = 'ok'] = process.argv.slice(2);
const event = JSON.parse(readFileSync(0, 'utf8'));

// Claude Code і Codex: snake_case; Copilot CLI (події camelCase): toolName/toolArgs.
const tool = event.tool_name ?? event.toolName ?? event.toolCall?.name ?? 'unknown';
let args = event.tool_input ?? event.toolArgs ?? event.toolCall?.args ?? {};
if (typeof args === 'string') {
  try {
    args = JSON.parse(args);
  } catch {
    args = {};
  }
}

// Лише шлях, команда чи шаблон — ніколи вміст файлу.
const input = {};
if (tool === 'apply_patch') {
  // Codex кладе текст патча в command: беремо з нього тільки назви файлів.
  const patch = Array.isArray(args.command) ? args.command.join('\n') : String(args.command ?? '');
  input.files = [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map((m) => m[1].trim());
} else {
  for (const key of ['file_path', 'filePath', 'path', 'command', 'pattern', 'url', 'name', 'skill']) {
    if (typeof args[key] === 'string') input[key] = args[key].slice(0, 200);
  }
}

// Визначаємо корінь проекту: якщо хук викликано з .agents/, cwd буде .agents
const rootDir = process.env.CLAUDE_PROJECT_DIR ?? event.workspacePaths?.[0] ?? (process.cwd().endsWith('.agents') ? join(process.cwd(), '..') : process.cwd());
const dir = join(rootDir, '.agent-log');
mkdirSync(dir, { recursive: true });
const session = event.session_id ?? event.sessionId ?? event.conversationId ?? 'unknown';
const row = { ts: new Date().toISOString(), tool, input, result, session, source };
appendFileSync(join(dir, `${source}.jsonl`), `${JSON.stringify(row)}\n`);

// Antigravity PostToolUse hook очікує валідний JSON у stdout
process.stdout.write('{}\n');