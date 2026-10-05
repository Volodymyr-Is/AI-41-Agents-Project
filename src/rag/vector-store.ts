import type { Chunk, ScoredChunk } from './types';
import { tokenize } from './bm25';

export type Vector = number[];

/**
 * Computes cosine similarity between two dense vectors.
 */
export function cosineSimilarity(a: Vector, b: Vector): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : Math.max(0, Math.min(1, dot / denominator));
}

/**
 * Deterministic N-gram character/word hash embedding generator.
 * Creates a fixed-dimension semantic fingerprint vector (e.g. dimension 256 or 512).
 * Fast, offline, works for Ukrainian and multilingual queries.
 */
export function generateFeatureVector(text: string, dimension = 256): Vector {
  const vector = new Array<number>(dimension).fill(0);
  const normalized = text.toLowerCase().trim();
  if (!normalized) return vector;

  const words = tokenize(normalized);

  // 1. Word-level hashing with frequency weighting
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + (word.charCodeAt(i) || 0)) & 0xffffffff;
    }
    const idx = Math.abs(hash) % dimension;
    vector[idx] = (vector[idx] ?? 0) + 2.0;
  }

  // 2. Character 3-gram hashing (subword semantic matching)
  for (let i = 0; i <= normalized.length - 3; i++) {
    const gram = normalized.substring(i, i + 3);
    let hash = 0;
    for (let j = 0; j < gram.length; j++) {
      hash = (hash * 37 + (gram.charCodeAt(j) || 0)) & 0xffffffff;
    }
    const idx = Math.abs(hash) % dimension;
    vector[idx] = (vector[idx] ?? 0) + 0.5;
  }

  // Normalize vector to unit length
  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    const val = vector[i] ?? 0;
    norm += val * val;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimension; i++) {
      const val = vector[i] ?? 0;
      vector[i] = val / norm;
    }
  }

  return vector;
}

/**
 * In-memory Vector Store for semantic similarity search.
 */
export class VectorStore {
  private chunks: Chunk[] = [];
  private vectors: Vector[] = [];
  private readonly dimension: number;

  constructor(dimension = 256) {
    this.dimension = dimension;
  }

  /**
   * Adds or indexes a collection of chunks with their feature vectors.
   */
  public buildIndex(chunks: Chunk[]): void {
    this.chunks = chunks;
    this.vectors = chunks.map((chunk) => {
      const textToEmbed = `${chunk.docTitle} ${chunk.sectionTitle ?? ''}\n${chunk.content}`;
      return generateFeatureVector(textToEmbed, this.dimension);
    });
  }

  /**
   * Performs semantic similarity search against indexed chunks.
   */
  public search(query: string, topK = 5, minScore = 0.05): ScoredChunk[] {
    if (this.chunks.length === 0 || !query.trim()) {
      return [];
    }

    const queryVector = generateFeatureVector(query, this.dimension);
    const results: ScoredChunk[] = [];

    for (let i = 0; i < this.chunks.length; i++) {
      const vec = this.vectors[i];
      const chunk = this.chunks[i];
      if (!vec || !chunk) continue;

      const score = cosineSimilarity(queryVector, vec);
      if (score >= minScore) {
        results.push({
          chunk,
          score,
          semanticScore: score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  public getChunkCount(): number {
    return this.chunks.length;
  }
}
