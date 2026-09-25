// Hook журналу для інструментів без jq: читає JSON події зі stdin і дописує
// один рядок формату курсу в .agent-log/<source>.jsonl.
// Виклик: node scripts/agent-log-hook.mjs <source> [phase/result]
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [source = 'unknown', mode = 'post'] = process.argv.slice(2);
let event = {};
try {
  event = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  event = {};
}

// Antigravity передає toolCall у PreToolUse, а Codex/Copilot передають tool_name/tool_input у PostToolUse
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
  const patch = Array.isArray(args.command) ? args.command.join('\n') : String(args.command ?? '');
  input.files = [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map((m) => m[1].trim());
} else {
  for (const key of ['file_path', 'filePath', 'path', 'command', 'CommandLine', 'pattern', 'Query', 'url', 'Url', 'name', 'skill', 'AbsolutePath', 'SearchPath', 'TargetFile', 'DirectoryPath']) {
    if (typeof args[key] === 'string') input[key] = args[key].slice(0, 200);
  }
}

const rootDir = process.env.CLAUDE_PROJECT_DIR ?? event.workspacePaths?.[0] ?? (process.cwd().endsWith('.agents') ? join(process.cwd(), '..') : process.cwd());
const dir = join(rootDir, '.agent-log');
mkdirSync(dir, { recursive: true });
const session = event.session_id ?? event.sessionId ?? event.conversationId ?? 'unknown';

// Якщо це Antigravity: PreToolUse має повний toolCall.args, записуємо рядок
if (source === 'antigravity') {
  if (mode === 'pre' && tool !== 'unknown') {
    const row = { ts: new Date().toISOString(), tool, input, result: 'ok', session, source };
    appendFileSync(join(dir, `${source}.jsonl`), `${JSON.stringify(row)}\n`);
  }
  // Завжди відповідаємо дозволом для PreToolUse або пустим об'єктом для PostToolUse
  if (mode === 'pre') {
    process.stdout.write(JSON.stringify({ decision: 'allow' }) + '\n');
  } else {
    process.stdout.write('{}\n');
  }
} else {
  // Для Codex / Copilot CLI (PostToolUse)
  const result = mode === 'error' ? 'error' : 'ok';
  const row = { ts: new Date().toISOString(), tool, input, result, session, source };
  appendFileSync(join(dir, `${source}.jsonl`), `${JSON.stringify(row)}\n`);
}