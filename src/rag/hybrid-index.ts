import type { Chunk, Document, ScoredChunk, SearchOptions } from './types';
import { BM25Index } from './bm25';
import { VectorStore } from './vector-store';
import { chunkDocuments, loadDocumentsFromDir } from './chunker';

export interface ResolvedSearchOptions {
  topK: number;
  minScore: number;
  weightLexical: number;
  weightSemantic: number;
}

export const DEFAULT_SEARCH_OPTIONS: ResolvedSearchOptions = {
  topK: 3,
  minScore: 0.01,
  weightLexical: 0.5,
  weightSemantic: 0.5,
};

/**
 * Hybrid Search Engine combining BM25 lexical search and Vector semantic search.
 * Uses Reciprocal Rank Fusion (RRF) and normalized score blending.
 */
export class HybridIndex {
  private bm25: BM25Index;
  private vectorStore: VectorStore;
  private chunks: Chunk[] = [];

  constructor() {
    this.bm25 = new BM25Index();
    this.vectorStore = new VectorStore(256);
  }

  /**
   * Initializes index directly from markdown files in a directory.
   */
  public loadFromDirectory(dataDir: string): void {
    const docs = loadDocumentsFromDir(dataDir);
    this.indexDocuments(docs);
  }

  /**
   * Indexes a collection of documents.
   */
  public indexDocuments(docs: Document[]): void {
    this.chunks = chunkDocuments(docs);
    this.bm25.buildIndex(this.chunks);
    this.vectorStore.buildIndex(this.chunks);
  }

  /**
   * Indexes pre-built chunks directly.
   */
  public indexChunks(chunks: Chunk[]): void {
    this.chunks = chunks;
    this.bm25.buildIndex(chunks);
    this.vectorStore.buildIndex(chunks);
  }

  /**
   * Performs hybrid retrieval combining lexical and semantic results via RRF.
   */
  public search(query: string, customOptions?: SearchOptions): ScoredChunk[] {
    const topK: number = customOptions?.topK ?? DEFAULT_SEARCH_OPTIONS.topK;
    const minScore: number = customOptions?.minScore ?? DEFAULT_SEARCH_OPTIONS.minScore;
    const weightLexical: number = customOptions?.weightLexical ?? DEFAULT_SEARCH_OPTIONS.weightLexical;
    const weightSemantic: number = customOptions?.weightSemantic ?? DEFAULT_SEARCH_OPTIONS.weightSemantic;

    const candidateK = Math.max(10, topK * 3);

    const lexicalResults = this.bm25.search(query, candidateK);
    const semanticResults = this.vectorStore.search(query, candidateK);

    const scoreMap = new Map<string, {
      chunk: Chunk;
      lexicalScore: number;
      semanticScore: number;
      rrfScore: number;
    }>();

    // RRF constant
    const k = 60;

    // Process lexical ranks
    lexicalResults.forEach((res, rank) => {
      const chunkId = res.chunk.id;
      const rrf = weightLexical * (1 / (k + rank + 1));
      scoreMap.set(chunkId, {
        chunk: res.chunk,
        lexicalScore: res.score,
        semanticScore: 0,
        rrfScore: rrf,
      });
    });

    // Process semantic ranks
    semanticResults.forEach((res, rank) => {
      const chunkId = res.chunk.id;
      const rrf = weightSemantic * (1 / (k + rank + 1));
      const existing = scoreMap.get(chunkId);
      if (existing) {
        existing.semanticScore = res.score;
        existing.rrfScore += rrf;
      } else {
        scoreMap.set(chunkId, {
          chunk: res.chunk,
          lexicalScore: 0,
          semanticScore: res.score,
          rrfScore: rrf,
        });
      }
    });

    const combined = Array.from(scoreMap.values())
      .map((entry) => ({
        chunk: entry.chunk,
        score: entry.rrfScore,
        lexicalScore: entry.lexicalScore,
        semanticScore: entry.semanticScore,
      }))
      .filter((res) => res.score >= minScore)
      .sort((a, b) => b.score - a.score);

    return combined.slice(0, topK);
  }

  public getChunks(): Chunk[] {
    return this.chunks;
  }

  public getStats() {
    return {
      chunkCount: this.chunks.length,
      vocabularySize: this.bm25.getVocabularySize(),
    };
  }
}
