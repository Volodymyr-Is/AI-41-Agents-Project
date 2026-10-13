/**
 * CLI-утиліта гібридного пошуку (Лабораторна 2, Крок 05).
 * Поєднує повнотекстовий пошук BM25 та векторний семантичний пошук через RRF (Reciprocal Rank Fusion, k=60).
 *
 * Використання:
 *   npx tsx scripts/search.ts "<запит>" [--explain] [--top-k <число>]
 *
 * Приклади:
 *   npx tsx scripts/search.ts "шкала навантаження Borg RPE 1-10" --explain
 *   npx tsx scripts/search.ts "відновлення водно-сольового балансу в спеку" --explain
 */
import fs from 'node:fs';
import path from 'node:path';
import { HybridIndex, type ScoredChunk } from '../src/rag';

export interface SearchCliArgs {
  query: string;
  explain: boolean;
  topK: number;
  json: boolean;
}

const INDEX_FILE = path.resolve(process.cwd(), 'data/index.json');
const DATA_DIR = path.resolve(process.cwd(), 'docs/lab2/data');

export function parseSearchArgs(args: string[]): SearchCliArgs {
  let explain = false;
  let json = false;
  let topK = 5;
  const queryParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === '--explain') {
      explain = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--top-k' || arg === '-k') {
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        topK = Math.max(1, parseInt(next, 10) || 5);
        i++;
      }
    } else if (arg.startsWith('--top-k=')) {
      const val = arg.split('=')[1];
      if (val) {
        topK = Math.max(1, parseInt(val, 10) || 5);
      }
    } else if (!arg.startsWith('-')) {
      queryParts.push(arg);
    }
  }

  return {
    query: queryParts.join(' ').trim(),
    explain,
    topK,
    json,
  };
}

export function loadHybridIndex(): HybridIndex {
  const hybrid = new HybridIndex();

  if (fs.existsSync(INDEX_FILE)) {
    try {
      const raw = fs.readFileSync(INDEX_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.chunks) && data.chunks.length > 0) {
        hybrid.indexChunks(data.chunks);
        return hybrid;
      }
    } catch {
      // Fallback до прямого завантаження з теки
    }
  }

  if (fs.existsSync(DATA_DIR)) {
    hybrid.loadFromDirectory(DATA_DIR);
    return hybrid;
  }

  throw new Error(`Не знайдено ані ${INDEX_FILE}, ані директорії ${DATA_DIR}`);
}

export function formatSearchResult(res: ScoredChunk, index: number): string {
  const { chunk, score, rankWords, rankVector } = res;
  const citation = `[${chunk.docId.replace(/\.md$/, '')}#chunk-${chunk.id.split('#chunk-')[1] ?? '0'}]`;
  const sec = chunk.sectionTitle ? ` — ${chunk.sectionTitle}` : '';

  const vectorInfo = rankVector != null ? `#${rankVector}` : '—';
  const wordsInfo = rankWords != null ? `#${rankWords}` : '—';

  const preview = chunk.content.trim().split('\n').slice(0, 4).join('\n');

  return [
    `[${index + 1}] ${citation} ${chunk.docTitle}${sec}`,
    `    RRF Score: ${score.toFixed(6)} | Ранг слів (BM25): ${wordsInfo} | Ранг вектора: ${vectorInfo}`,
    `    Фрагмент:`,
    ...preview.split('\n').map((l) => `      ${l}`),
  ].join('\n');
}

export function formatExplainTable(query: string, results: ScoredChunk[]): string {
  const lines: string[] = [];
  lines.push(`=== Пояснення гібридного пошуку (RRF Fusion, k=60) ===`);
  lines.push(`Запит: "${query}"`);
  lines.push(`Знайдено релевантних чанків: ${results.length}\n`);

  lines.push(`| № | Чанк ID | Вектор (Cosine) | Слова (BM25) | RRF Score | Джерело та секція |`);
  lines.push(`|---|---------|-----------------|--------------|-----------|-------------------|`);

  results.forEach((r, idx) => {
    const cid = r.chunk.id;
    const vRank = r.rankVector != null ? `ранг ${r.rankVector} (${(r.semanticScore ?? 0).toFixed(4)})` : '—';
    const wRank = r.rankWords != null ? `ранг ${r.rankWords} (${(r.lexicalScore ?? 0).toFixed(4)})` : '—';
    const rrf = r.score.toFixed(6);
    const doc = `[${r.chunk.docId}] ${r.chunk.sectionTitle ?? r.chunk.docTitle}`;
    lines.push(`| ${idx + 1} | ${cid} | ${vRank} | ${wRank} | ${rrf} | ${doc} |`);
  });

  lines.push(`\nФормула обчислення RRF (Reciprocal Rank Fusion, k = 60, ваги 0.5 / 0.5):`);
  lines.push(`  RRF(d) = 0.5 * (1 / (60 + rank_BM25)) + 0.5 * (1 / (60 + rank_Vector))`);
  lines.push(`  - Якщо чанк знайдено лише одним методом, другий ранг вважається відсутнім (внесок 0).`);

  if (results.length > 0) {
    const top = results[0]!;
    lines.push(`\nДіагностика лідера [${top.chunk.id}]:`);
    if (top.rankWords != null && top.rankVector != null) {
      lines.push(`  -> Гібридний синергетичний ефект: документ потрапив у топ обох методів (BM25 #${top.rankWords}, Вектор #${top.rankVector}).`);
    } else if (top.rankWords != null) {
      lines.push(`  -> Перевага точного лексичного збігу: виявлено рідкісний термін, BM25 ранг #${top.rankWords}.`);
    } else {
      lines.push(`  -> Перевага векторної семантики: лексичні збіги відсутні або низькі, але семантична схожість висока, ранг #${top.rankVector}.`);
    }
  }

  return lines.join('\n');
}

export function runSearch(args: string[]): {
  query: string;
  explain: boolean;
  results: ScoredChunk[];
} {
  const parsed = parseSearchArgs(args);
  if (!parsed.query) {
    console.log(`Використання:`);
    console.log(`  npx tsx scripts/search.ts "<запит>" [--explain] [--top-k <число>] [--json]`);
    console.log(`\nПриклади:`);
    console.log(`  npx tsx scripts/search.ts "шкала навантаження Borg RPE 1-10" --explain`);
    console.log(`  npx tsx scripts/search.ts "відновлення водно-сольового балансу в спеку" --explain`);
    return { query: '', explain: false, results: [] };
  }

  const hybrid = loadHybridIndex();
  const results = hybrid.search(parsed.query, { topK: parsed.topK });

  if (parsed.json) {
    console.log(JSON.stringify({ query: parsed.query, count: results.length, results }, null, 2));
    return { query: parsed.query, explain: parsed.explain, results };
  }

  if (parsed.explain) {
    console.log(formatExplainTable(parsed.query, results));
  } else {
    console.log(`=== Результати пошуку для: "${parsed.query}" ===`);
    console.log(`Знайдено результатів: ${results.length}\n`);
    if (results.length === 0) {
      console.log(`(Жодного релевантного фрагмента не знайдено)`);
    } else {
      results.forEach((r, i) => {
        console.log(formatSearchResult(r, i));
        console.log('');
      });
    }
  }

  return { query: parsed.query, explain: parsed.explain, results };
}

if (process.argv[1] && process.argv[1].includes('search')) {
  runSearch(process.argv.slice(2));
}
