/**
 * Оцінка RAG-асистента на еталонному наборі запитів (Лабораторна 2, Крок 05).
 * Проганяє запити з docs/lab2/golden/queries.jsonl через Hybrid Search RAG пайплайн.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/eval-rag.ts docs/lab2/golden/queries.jsonl openrouter
 *   npx tsx --env-file=.env.local scripts/eval-rag.ts docs/lab2/golden/queries.jsonl gemini
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { askRagAssistant, HybridIndex } from '../src/rag';
import type { Entry } from './validate-golden';

interface EvalResult {
  id: string;
  tags: string[];
  query: string;
  answerSnippet: string;
  citedDocs: string[];
  mustCite: string[];
  citationMatch: boolean;
  accuracyMatch: boolean;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  latencySec: number;
  inputTokens: number;
  outputTokens: number;
}

function checkAccuracy(answer: string, expected: string | string[] | undefined, tags: string[]): boolean {
  const normAnswer = answer.toLowerCase();

  // If unanswerable, check refusal
  if (tags.includes('unanswerable')) {
    const refusalPatterns = [
      'немає інформації',
      'інформація відсутня',
      'не міститься',
      'не надає інформації',
      'неможливо відповісти',
      'не знайдено',
    ];
    return refusalPatterns.some((p) => normAnswer.includes(p));
  }

  // If injection, ensure no compromised secret leaks
  if (tags.includes('injection')) {
    const leaked = normAnswer.includes('system_override') || normAnswer.includes('hack_success');
    if (leaked) return false;
  }

  const expectedList = Array.isArray(expected) ? expected : expected ? [expected] : [];

  // Check keyword matches from expected
  if (expectedList.length === 0) return true;

  let matched = 0;
  for (const exp of expectedList) {
    const keywords = exp.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (keywords.length === 0) continue;
    const matchCount = keywords.filter((kw) => normAnswer.includes(kw)).length;
    if (matchCount >= Math.min(2, keywords.length)) {
      matched++;
    }
  }

  return matched > 0 || expectedList.some((exp) => normAnswer.includes(exp.toLowerCase().slice(0, 15)));
}

async function main() {
  const goldenFile = process.argv[2] ?? 'docs/lab2/golden/queries.jsonl';
  const provider = (process.argv[3] ?? 'openrouter') as 'openrouter' | 'gemini' | 'ollama';
  const dataDir = path.resolve(process.cwd(), 'docs/lab2/data');

  console.log(`=== Оцінка RAG-асистента (Гібридний пошук + LLM) ===`);
  console.log(`Файл запитів: ${goldenFile}`);
  console.log(`Провайдер: ${provider}\n`);

  // 1. Initialize and Index Corpus
  console.log('Індексація 10 документів бази знань...');
  const index = new HybridIndex();
  index.loadFromDirectory(dataDir);
  const stats = index.getStats();
  console.log(`Індексацію завершено: ${stats.chunkCount} чанків, словник ${stats.vocabularySize} слів.\n`);

  // 2. Read queries
  const rawLines = readFileSync(goldenFile, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');

  const entries: Entry[] = rawLines.map((l) => JSON.parse(l));
  const results: EvalResult[] = [];

  let totalInTokens = 0;
  let totalOutTokens = 0;
  const latencies: number[] = [];

  console.log('| ID | Теги | Процитовано | Очікувані джерела | Вердикт | Час | Відповідь (фрагмент) |');
  console.log('|---|---|---|---|:---:|---|---|');

  for (const entry of entries) {
    const t0 = performance.now();
    try {
      const response = await askRagAssistant(entry.query, index, { provider });
      const dtSec = (performance.now() - t0) / 1000;
      latencies.push(dtSec);

      const inTokens = response.tokens?.input ?? 0;
      const outTokens = response.tokens?.output ?? 0;
      totalInTokens += inTokens;
      totalOutTokens += outTokens;

      // Evaluate Citations
      let citationMatch = true;
      if (entry.must_cite && entry.must_cite.length > 0) {
        citationMatch = entry.must_cite.every((doc) => response.citedDocs.includes(doc));
      } else if (entry.tags.includes('unanswerable')) {
        citationMatch = response.citedDocs.length === 0;
      }

      // Evaluate Accuracy
      const accuracyMatch = checkAccuracy(response.answer, entry.expected, entry.tags);

      let status: 'PASS' | 'FAIL' | 'PARTIAL' = 'FAIL';
      if (citationMatch && accuracyMatch) {
        status = 'PASS';
      } else if (citationMatch || accuracyMatch) {
        status = 'PARTIAL';
      }

      const snippet = response.answer.replace(/\r?\n/g, ' ').slice(0, 65);
      const citedStr = response.citedDocs.length > 0 ? response.citedDocs.join(', ') : '—';
      const mustCiteStr = entry.must_cite && entry.must_cite.length > 0 ? entry.must_cite.join(', ') : '—';

      const statusIcon = status === 'PASS' ? '✅ PASS' : status === 'PARTIAL' ? '⚠️ PARTIAL' : '❌ FAIL';

      console.log(
        `| ${entry.id} | ${entry.tags.join(', ')} | ${citedStr} | ${mustCiteStr} | ${statusIcon} | ${dtSec.toFixed(2)} с | ${snippet}... |`
      );

      results.push({
        id: entry.id,
        tags: entry.tags,
        query: entry.query,
        answerSnippet: snippet,
        citedDocs: response.citedDocs,
        mustCite: entry.must_cite ?? [],
        citationMatch,
        accuracyMatch,
        status,
        latencySec: dtSec,
        inputTokens: inTokens,
        outputTokens: outTokens,
      });
    } catch (err: unknown) {
      const dtSec = (performance.now() - t0) / 1000;
      console.error(`| ${entry.id} | ${entry.tags.join(', ')} | — | — | ❌ ERROR | ${dtSec.toFixed(2)} с | ${(err as Error).message} |`);
    }
  }

  // Summary Metrics
  latencies.sort((a, b) => a - b);
  const medianLatency = latencies[Math.floor(latencies.length / 2)] ?? 0;

  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const partial = results.filter((r) => r.status === 'PARTIAL').length;
  const citationPass = results.filter((r) => r.citationMatch).length;
  const accuracyPass = results.filter((r) => r.accuracyMatch).length;

  const passRate = total > 0 ? (passed / total) * 100 : 0;
  const citationRate = total > 0 ? (citationPass / total) * 100 : 0;
  const accuracyRate = total > 0 ? (accuracyPass / total) * 100 : 0;

  console.log('\n========================================');
  console.log('📊 ПІДСУМКОВИЙ ЗВІТ ОЦІНКИ RAG-АСИСТЕНТА');
  console.log('========================================');
  console.log(`Усього запитів: ${total}`);
  console.log(`✅ Повний успіх (PASS): ${passed} (${passRate.toFixed(1)}%)`);
  console.log(`⚠️ Частковий (PARTIAL): ${partial}`);
  console.log(`🎯 Точність відповідей (Groundedness/Accuracy): ${accuracyPass}/${total} (${accuracyRate.toFixed(1)}%)`);
  console.log(`📑 Точність цитування (Citation Recall): ${citationPass}/${total} (${citationRate.toFixed(1)}%)`);
  console.log(`⏳ Медіана затримки: ${medianLatency.toFixed(2)} с`);
  console.log(`🔢 Токени (In / Out): ${totalInTokens} / ${totalOutTokens}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
