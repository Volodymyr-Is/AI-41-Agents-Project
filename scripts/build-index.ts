/**
 * Побудова індексу (Лабораторна 2, Крок 04).
 * Індексує документи корпусу docs/lab2/data/ та зберігає data/index.json.
 *
 * Запуск:
 *   npx tsx scripts/build-index.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  chunkDocuments,
  DEFAULT_CHUNK_OPTIONS,
  loadDocumentsFromDir,
} from '../src/rag';

const DATA_DIR = path.resolve(process.cwd(), 'docs/lab2/data');
const OUT_DIR = path.resolve(process.cwd(), 'data');
const OUT_FILE = path.join(OUT_DIR, 'index.json');

export interface SerializedIndex {
  version: 1;
  builtAt: string;
  sourceDir: string;
  documentCount: number;
  chunkCount: number;
  rule: typeof DEFAULT_CHUNK_OPTIONS;
  stats: {
    medianLength: number;
    minLength: number;
    maxLength: number;
  };
  documents: Array<{
    id: string;
    title: string;
    chars: number;
  }>;
  chunks: Array<{
    id: string;
    docId: string;
    docTitle: string;
    sectionTitle?: string | undefined;
    content: string;
    charStart: number;
    charEnd: number;
    tokenCount: number;
  }>;
}

export function buildAndSaveIndex(): SerializedIndex {
  const started = performance.now();

  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`Директорія документів не знайдена: ${DATA_DIR}`);
  }

  const docs = loadDocumentsFromDir(DATA_DIR);
  if (docs.length < 10) {
    throw new Error(`У ${DATA_DIR} лише ${docs.length} документів, потрібно щонайменше 10`);
  }

  const chunks = chunkDocuments(docs, DEFAULT_CHUNK_OPTIONS);
  const lengths = chunks.map((c) => c.content.length).sort((a, b) => a - b);
  const medianLength = lengths[Math.floor(lengths.length / 2)] ?? 0;
  const minLength = lengths[0] ?? 0;
  const maxLength = lengths[lengths.length - 1] ?? 0;

  const indexData: SerializedIndex = {
    version: 1,
    builtAt: new Date().toISOString(),
    sourceDir: 'docs/lab2/data',
    documentCount: docs.length,
    chunkCount: chunks.length,
    rule: DEFAULT_CHUNK_OPTIONS,
    stats: {
      medianLength,
      minLength,
      maxLength,
    },
    documents: docs.map((d) => ({
      id: d.id,
      title: d.title,
      chars: d.content.length,
    })),
    chunks: chunks.map((c) => ({
      id: c.id,
      docId: c.docId,
      docTitle: c.docTitle,
      sectionTitle: c.sectionTitle,
      content: c.content,
      charStart: c.charStart,
      charEnd: c.charEnd,
      tokenCount: c.tokenCount,
    })),
  };

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(indexData, null, 2), 'utf8');
  const elapsedSec = (performance.now() - started) / 1000;
  const sizeKb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);

  console.log(`=== Побудова індексу корпусу (Крок 04) ===`);
  console.log(`Документів: ${docs.length}`);
  console.log(`Фрагментів (чанків): ${chunks.length}`);
  console.log(`Довжина: медіана ${medianLength}, мін ${minLength}, макс ${maxLength} символів`);
  console.log(`Файл індексу: data/index.json (${sizeKb} КБ)`);
  console.log(`Час побудови: ${elapsedSec.toFixed(2)} с\n`);

  return indexData;
}

if (process.argv[1] && process.argv[1].includes('build-index')) {
  buildAndSaveIndex();
}
