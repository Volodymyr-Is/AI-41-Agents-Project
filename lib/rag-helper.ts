import fs from 'fs';
import path from 'path';
import { HybridIndex } from '@/src/rag/hybrid-index';
import type { Chunk } from '@/src/rag/types';
import type { ExerciseItem, RagCitation } from './types';

let cachedIndex: HybridIndex | null = null;

function getHybridIndex(): HybridIndex | null {
  if (cachedIndex) return cachedIndex;

  const indexPath = path.join(process.cwd(), 'data', 'index.json');
  const corpusDir = path.join(process.cwd(), 'docs', 'lab2', 'data');

  try {
    const index = new HybridIndex();
    if (fs.existsSync(indexPath)) {
      const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as { chunks?: Chunk[] };
      if (Array.isArray(parsed.chunks) && parsed.chunks.length > 0) {
        index.indexChunks(parsed.chunks);
        cachedIndex = index;
        return cachedIndex;
      }
    }
    if (fs.existsSync(corpusDir)) {
      index.loadFromDirectory(corpusDir);
      cachedIndex = index;
      return cachedIndex;
    }
  } catch (err) {
    console.warn('RAG index load warning:', err);
  }

  return null;
}

/**
 * Шукає релевантні спортивні протоколи у гібридному індексі ЛР2 (BM25 + Vector + RRF)
 * на основі переліку вправ поточного тренування.
 */
export function retrieveSportsContext(exercises: ExerciseItem[], topK = 3): RagCitation[] {
  const index = getHybridIndex();
  if (!index || exercises.length === 0) return [];

  const hasStrength = exercises.some((e) => e.type === 'strength');
  const hasCardio = exercises.some((e) => e.type === 'cardio');

  const queryParts: string[] = exercises.map((e) => e.name);
  if (hasStrength) {
    queryParts.push('силове тренування відновлення обсяг');
  }
  if (hasCardio) {
    queryParts.push('біг гідратація електроліти пульсові зони');
  }
  if (hasStrength && hasCardio) {
    queryParts.push('мікроцикл відновлення навантаження');
  }

  const results = index.search(queryParts.join(' '), { topK, minScore: 0.001 });
  return results.map((r) => ({
    id: r.chunk.id,
    title: r.chunk.docTitle,
    snippet: r.chunk.content.slice(0, 220).trim(),
    score: Number(r.score.toFixed(4)),
  }));
}
