import type { Chunk, ScoredChunk } from './types';

const UKRAINIAN_ENGLISH_STOPWORDS = new Set([
  'і', 'й', 'та', 'або', 'чи', 'в', 'у', 'на', 'з', 'із', 'зі', 'до', 'для',
  'про', 'що', 'як', 'це', 'той', 'який', 'яка', 'яке', 'які', 'не', 'ні',
  'за', 'по', 'при', 'від', 'під', 'над', 'перед', 'після', 'а', 'але',
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with',
  'by', 'about', 'as', 'is', 'are', 'was', 'were', 'it', 'that', 'this',
]);

/**
 * Tokenizes and normalizes text for lexical search.
 * Supports Ukrainian (Cyrillic) and Latin characters, numbers, and basic stemming.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !UKRAINIAN_ENGLISH_STOPWORDS.has(w));
}

/**
 * BM25 (Best Matching 25) Inverted Index for lexical retrieval.
 */
export class BM25Index {
  private chunks: Chunk[] = [];
  private docLengths: number[] = [];
  private avgDocLength = 0;
  // term -> Map(chunkIndex, termFrequency)
  private invertedIndex: Map<string, Map<number, number>> = new Map();
  // term -> IDF score
  private idfMap: Map<string, number> = new Map();

  private readonly k1: number;
  private readonly b: number;

  constructor(chunks: Chunk[] = [], k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    if (chunks.length > 0) {
      this.buildIndex(chunks);
    }
  }

  /**
   * Builds the inverted index and precomputes IDF for all terms.
   */
  public buildIndex(chunks: Chunk[]): void {
    this.chunks = chunks;
    this.docLengths = new Array(chunks.length).fill(0);
    this.invertedIndex.clear();
    this.idfMap.clear();

    let totalLength = 0;

    chunks.forEach((chunk, idx) => {
      // Include title and section for richer keyword matching
      const fullText = `${chunk.docTitle} ${chunk.sectionTitle ?? ''} ${chunk.content}`;
      const tokens = tokenize(fullText);
      this.docLengths[idx] = tokens.length;
      totalLength += tokens.length;

      const termFreqs = new Map<string, number>();
      for (const token of tokens) {
        termFreqs.set(token, (termFreqs.get(token) ?? 0) + 1);
      }

      for (const [term, freq] of termFreqs.entries()) {
        if (!this.invertedIndex.has(term)) {
          this.invertedIndex.set(term, new Map());
        }
        this.invertedIndex.get(term)!.set(idx, freq);
      }
    });

    const N = chunks.length;
    this.avgDocLength = N > 0 ? totalLength / N : 0;

    // Calculate IDF for each term: log(1 + (N - n + 0.5) / (n + 0.5))
    for (const [term, postingList] of this.invertedIndex.entries()) {
      const n = postingList.size;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      this.idfMap.set(term, Math.max(0.01, idf));
    }
  }

  /**
   * Scores all indexed chunks against a search query using BM25.
   */
  public search(query: string, topK = 5, minScore = 0.01): ScoredChunk[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.chunks.length === 0) {
      return [];
    }

    const scores = new Float64Array(this.chunks.length);

    for (const token of queryTokens) {
      const idf = this.idfMap.get(token);
      if (idf === undefined) continue;

      const postingList = this.invertedIndex.get(token);
      if (!postingList) continue;

      for (const [chunkIdx, freq] of postingList.entries()) {
        const docLen = this.docLengths[chunkIdx] ?? 0;
        const tfNumerator = freq * (this.k1 + 1);
        const tfDenominator =
          freq + this.k1 * (1 - this.b + this.b * (docLen / (this.avgDocLength || 1)));

        const currentScore = scores[chunkIdx] ?? 0;
        scores[chunkIdx] = currentScore + idf * (tfNumerator / tfDenominator);
      }
    }

    const results: ScoredChunk[] = [];
    for (let i = 0; i < scores.length; i++) {
      const score = scores[i] ?? 0;
      const chunk = this.chunks[i];
      if (score >= minScore && chunk) {
        results.push({
          chunk,
          score,
          lexicalScore: score,
        });
      }
    }

    // Sort descending by score
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  public getChunkCount(): number {
    return this.chunks.length;
  }

  public getVocabularySize(): number {
    return this.invertedIndex.size;
  }
}
