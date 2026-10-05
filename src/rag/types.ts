/**
 * Core type definitions for RAG (Retrieval-Augmented Generation) system.
 */

export interface Document {
  id: string; // e.g. "doc-01.md"
  title: string; // e.g. "[doc-01] Основи побудови тренувального мікроциклу"
  content: string;
  path: string;
}

export interface Chunk {
  id: string; // e.g. "doc-01#chunk-0"
  docId: string; // e.g. "doc-01.md"
  docTitle: string;
  sectionTitle?: string | undefined;
  content: string;
  charStart: number;
  charEnd: number;
  tokenCount: number;
}

export interface ChunkOptions {
  maxChunkSize?: number | undefined; // default ~400 chars
  minChunkSize?: number | undefined; // default ~50 chars
  overlap?: number | undefined; // default ~60 chars
}

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
  lexicalScore?: number | undefined;
  semanticScore?: number | undefined;
}

export interface SearchOptions {
  topK?: number | undefined;
  minScore?: number | undefined;
  weightLexical?: number | undefined; // for hybrid search, e.g. 0.5
  weightSemantic?: number | undefined; // for hybrid search, e.g. 0.5
}
