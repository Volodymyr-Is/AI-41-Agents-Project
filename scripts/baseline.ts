/**
 * Базова лінія без пошуку (Лабораторна 2, крок 01).
 * Проганяє запити з docs/lab2/golden/queries.jsonl через модель без надання документів.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/baseline.ts docs/lab2/golden/queries.jsonl gemini
 *   npx tsx --env-file=.env.local scripts/baseline.ts docs/lab2/golden/queries.jsonl openrouter
 *   npx tsx --env-file=.env.local scripts/baseline.ts docs/lab2/golden/queries.jsonl ollama-messages
 */
import { readFileSync } from 'node:fs';
import { chatCompletionsModel, messagesModel } from '../src/agent/adapters';
import type { Model } from '../src/agent/agent-loop';
import { addUsage, priceUsd, ZERO_USAGE, type Usage } from '../src/cost';
import { CATALOG, MODELS, type ModelSpec } from '../src/models';
import type { Entry } from './validate-golden';

const SYSTEM_PROMPT =
  'Ти асистент спортивного журналу. Відповідай на запитання користувача чітко й лаконічно на основі фактів. Якщо не знаєш відповіді або інформація відсутня в твоїх матеріалах — відмовся відповідати прямо і вкажи, що даних немає.';

function pickModel(kind: string): { model: Model; spec: ModelSpec; form: string } {
  if (kind === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY порожній: заповніть .env.local');
    const spec = CATALOG['gemini-3.8-flash'];
    return {
      spec,
      form: 'chat-completions',
      model: chatCompletionsModel({
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        model: spec.id,
        headers: { authorization: `Bearer ${key}` },
      }),
    };
  }

  if (kind === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY;
    const id = process.env.OPENROUTER_MODEL ?? 'nvidia/nemotron-3.5-lightning:free';
    if (!key) throw new Error('OPENROUTER_API_KEY порожній: заповніть .env.local');
    const spec: ModelSpec = {
      id,
      provider: 'openai',
      inputPerMTok: 0,
      outputPerMTok: 0,
      pricingUrl: 'https://openrouter.ai/models',
    };
    return {
      spec,
      form: 'chat-completions',
      model: chatCompletionsModel({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: id,
        headers: { authorization: `Bearer ${key}` },
      }),
    };
  }

  if (kind === 'ollama-messages' || kind === 'ollama') {
    const spec = MODELS.local;
    return {
      spec,
      form: 'messages',
      model: messagesModel({
        url: process.env.OLLAMA_MESSAGES_URL ?? 'http://127.0.0.1:11434/v1/messages',
        model: spec.id,
      }),
    };
  }

  throw new Error(`Невідомий провайдер "${kind}". Доступні: gemini, openrouter, ollama-messages`);
}

async function main() {
  const file = process.argv[2] ?? 'docs/lab2/golden/queries.jsonl';
  const provider = process.argv[3] ?? 'gemini';

  console.log(`=== Базова лінія: набір "${file}", провайдер "${provider}" ===\n`);

  const { model, spec } = pickModel(provider);
  const rawLines = readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');

  const entries: Entry[] = rawLines.map((l) => JSON.parse(l));

  let totalUsage: Usage = ZERO_USAGE;
  const latencies: number[] = [];

  console.log('| id | tags | відповідь моделі (фрагмент) | токени (in/out) | час |');
  console.log('|---|---|---|---|---|');

  for (const entry of entries) {
    const t0 = performance.now();
    try {
      const res = await model(
        SYSTEM_PROMPT,
        [{ role: 'user', text: entry.query }],
        [],
      );
      const dtSec = (performance.now() - t0) / 1000;
      latencies.push(dtSec);

      totalUsage = {
        inputTokens: totalUsage.inputTokens + res.usage.inputTokens,
        outputTokens: totalUsage.outputTokens + res.usage.outputTokens,
        cachedTokens: totalUsage.cachedTokens + res.usage.cachedTokens,
      };

      const cleanText = res.text?.replace(/\r?\n/g, ' ').slice(0, 80) ?? '(порожньо)';
      console.log(
        `| ${entry.id} | ${entry.tags.join(', ')} | ${cleanText}... | ${res.usage.inputTokens}/${res.usage.outputTokens} | ${dtSec.toFixed(2)} с |`,
      );
    } catch (err: unknown) {
      const dtSec = (performance.now() - t0) / 1000;
      console.error(`| ${entry.id} | ${entry.tags.join(', ')} | ПОМИЛКА: ${(err as Error).message} | — | ${dtSec.toFixed(2)} с |`);
    }
  }

  latencies.sort((a, b) => a - b);
  const medianLatency = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const cost = priceUsd(spec, totalUsage);

  console.log('\n=== Підсумкова статистика ===');
  console.log(`Усього запитів: ${entries.length}`);
  console.log(`Вхідні токени: ${totalUsage.inputTokens}`);
  console.log(`Вихідні токени: ${totalUsage.outputTokens}`);
  console.log(`Кешовані токени: ${totalUsage.cachedTokens}`);
  console.log(`Вартість за прайсом ($): ${cost.toFixed(6)}`);
  console.log(`Медіана затримки: ${medianLatency.toFixed(2)} с`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
