/**
 * Автономний агент для харнеса через OpenRouter API.
 * Приймає Task JSON, звертається до LLM, створює/модифікує зазначені файли
 * у поточному робочому дереві (cwd) та виводить структуровані метадані для run.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Task } from './run-task';

async function main() {
  let task: Task;
  try {
    if (process.argv[2] === '--b64' && process.argv[3]) {
      const decoded = Buffer.from(process.argv[3], 'base64').toString('utf8');
      task = JSON.parse(decoded) as Task;
    } else if (process.argv[2]) {
      task = JSON.parse(process.argv[2]) as Task;
    } else {
      console.error('Помилка: не передано JSON задачі');
      process.exit(1);
    }
  } catch (err) {
    console.error('Помилка парсингу JSON задачі:', err);
    process.exit(1);
  }


  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Помилка: OPENROUTER_API_KEY не знайдено у середовищі. Запустіть із прапорцем --env-file=.env.local');
    process.exit(1);
  }

  const model = process.env.HARNESS_MODEL || 'google/gemma-4-31b-it:free';
  const cwd = process.cwd();

  const systemPrompt = `Ти — кваліфікований autonomous coding agent у репозиторії TypeScript (strict mode, Node.js, Vitest).
Твоє завдання — вирішити задачу користувача, створивши або відредагувавши необхідні файли коду та тестів.
Ти ПОВИНЕН повернути ТІЛЬКИ валідний JSON-об'єкт наступного формату (без пояснень поза JSON):
{
  "explanation": "Короткий опис зроблених змін",
  "files": [
    {
      "path": "відносний/шлях/до/файлу.ts",
      "content": "повний сирцевий код файлу"
    }
  ]
}
Вимоги:
1. Код має бути валідним TypeScript, строго типізованим.
2. Тести мають використовувати vitest ('describe', 'it', 'expect') і проходити успішно.
3. Ніяких markdown-блоків навколо JSON, або якщо використовуєш, тільки один блок \`\`\`json ... \`\`\`.`;

  const userPrompt = `ЗАДАЧА [${task.id}]:
${task.input}

Критерії приймання (acceptance commands):
${task.acceptance.map((c) => `- ${c}`).join('\n')}

Цільові файли:
${(task.files ?? []).map((f) => `- ${f}`).join('\n')}

Створи всі необхідні файли та відповідні тести для успішного виконання команд acceptance.`;

  const candidates = [
    process.env.HARNESS_MODEL,
    'nvidia/nemotron-3.5-lightning:free',
    'google/gemma-4-31b-it:free',
  ].filter(Boolean) as string[];

  interface CompletionData {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }

  const started = Date.now();
  let usedModel = candidates[0] ?? 'nvidia/nemotron-3.5-lightning:free';
  let data: CompletionData | null = null;

  for (const m of candidates) {
    usedModel = m;
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/Volodymyr-Is/AI-41-Agents-Project',
          'X-Title': 'Agentic Harness Lab3',
        },
        body: JSON.stringify({
          model: m,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
        }),
      });

      if (response.status === 429) {
        console.warn(`Модель ${m} повернула 429 (Rate Limit). Пробуємо наступну модель...`);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Модель ${m} повернула HTTP ${response.status}: ${errText}. Пробуємо наступну...`);
        continue;
      }

      const parsed = (await response.json()) as CompletionData;
      if (parsed?.choices?.[0]?.message?.content) {
        data = parsed;
        break;
      }
    } catch (fetchErr) {
      console.warn(`Помилка запиту до ${m}:`, fetchErr);
    }
  }

  if (!data || !data.choices?.[0]?.message?.content) {
    console.error('Не вдалося отримати відповідь від жодної з моделей-кандидатів');
    process.exit(1);
  }



  const rawContent = data.choices?.[0]?.message?.content ?? '';
  let cleaned = rawContent.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  interface SolutionPayload {
    explanation?: string;
    files?: Array<{ path: string; content: string }>;
  }

  let payload: SolutionPayload;
  try {
    payload = JSON.parse(cleaned) as SolutionPayload;
  } catch (parseErr) {
    console.error('Помилка розбору відповіді моделі як JSON:', parseErr);
    console.error('Сира відповідь:', rawContent);
    process.exit(1);
  }

  const filesWritten: string[] = [];
  if (Array.isArray(payload.files)) {
    for (const f of payload.files) {
      if (!f.path || typeof f.content !== 'string') continue;

      // Захист від Path Traversal
      const targetAbs = resolve(cwd, f.path);
      if (!targetAbs.startsWith(cwd)) {
        console.error(`Відхилено небезпечний шлях: ${f.path}`);
        continue;
      }

      mkdirSync(dirname(targetAbs), { recursive: true });
      writeFileSync(targetAbs, f.content, 'utf8');
      filesWritten.push(f.path);
    }
  }

  const durationSec = Math.round((Date.now() - started) / 100) / 10;
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  // Вивід структурованого результату в stdout для readMeta() у run-task.ts
  const meta = {
    session_id: data.id ?? `openrouter-${Date.now()}`,
    model: usedModel,
    duration_s: durationSec,
    total_cost_usd: 0.0, // Free tier
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
    explanation: payload.explanation ?? 'Файли згенеровано через OpenRouter',
    files_created: filesWritten,
  };

  process.stdout.write(JSON.stringify(meta, null, 2));
}

main().catch((err) => {
  console.error('Непередбачена помилка openrouter-agent:', err);
  process.exit(1);
});
