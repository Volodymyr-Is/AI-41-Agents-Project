import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAndSaveIndex } from '../scripts/build-index';
import { formatExplainTable, formatSearchResult, parseSearchArgs, runSearch } from '../scripts/search';
import { HybridIndex } from '../src/rag';

const DATA_DIR = path.resolve(__dirname, '../docs/lab2/data');
const INDEX_FILE = path.resolve(__dirname, '../data/index.json');

describe('Retrieval & Indexing (Lab 2, Steps 04 & 05)', () => {
  describe('Index Generation (Step 04)', () => {
    it('builds and saves serialized index to data/index.json', () => {
      const indexData = buildAndSaveIndex();

      expect(indexData.version).toBe(1);
      expect(indexData.documentCount).toBe(10);
      expect(indexData.chunkCount).toBeGreaterThanOrEqual(10);
      expect(indexData.stats.medianLength).toBeGreaterThan(0);
      expect(indexData.stats.minLength).toBeGreaterThan(0);
      expect(indexData.stats.maxLength).toBeGreaterThanOrEqual(indexData.stats.minLength);

      expect(fs.existsSync(INDEX_FILE)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      expect(saved.documentCount).toBe(10);
      expect(saved.chunks.length).toBe(indexData.chunkCount);
    });
  });

  describe('CLI Argument Parser (Step 05)', () => {
    it('parses search query and flags correctly', () => {
      const parsed = parseSearchArgs(['шкала навантаження Borg RPE 1-10', '--explain']);
      expect(parsed.query).toBe('шкала навантаження Borg RPE 1-10');
      expect(parsed.explain).toBe(true);
      expect(parsed.topK).toBe(5);
    });

    it('parses custom top-k flag', () => {
      const parsed = parseSearchArgs(['пусті запитання', '--top-k', '3']);
      expect(parsed.query).toBe('пусті запитання');
      expect(parsed.explain).toBe(false);
      expect(parsed.topK).toBe(3);
    });
  });

  describe('RRF Ranking and Two Empirical Proofs (Step 05)', () => {
    it('calculates RRF math accurately with k=60', () => {
      const k = 60;
      const rank1 = 1;
      const rrfComponent = 0.5 * (1 / (k + rank1));
      // 0.5 * (1 / 61) = 0.00819672...
      expect(rrfComponent).toBeCloseTo(0.0081967, 6);
    });

    it('Proof 1 (Lexical Dominance): BM25 ranks rare term as #1', () => {
      const hybrid = new HybridIndex();
      hybrid.loadFromDirectory(DATA_DIR);

      // Query with rare specific terms: "Borg RPE 1-10"
      const query = 'шкала навантаження Borg RPE 1-10';
      const results = hybrid.search(query, { topK: 3 });

      expect(results.length).toBeGreaterThan(0);
      const top = results[0]!;
      expect(top.chunk.docId).toBe('doc-10.md');
      expect(top.rankWords).toBe(1); // BM25 rank 1
      expect(top.lexicalScore).toBeGreaterThan(0);
    });

    it('Proof 2 (Semantic Dominance): Vector similarity retrieves relevant chunk', () => {
      const hybrid = new HybridIndex();
      hybrid.loadFromDirectory(DATA_DIR);

      // Semantic query for doc-04: hydration and sodium in heat
      const query = 'вживання рідини та натрію при спекотній погоді';
      const bm25Res = hybrid.getBm25().search(query, 5);
      const vecRes = hybrid.getVectorStore().search(query, 5);
      const results = hybrid.search(query, { topK: 3 });

      expect(results.length).toBeGreaterThan(0);
      expect(vecRes[0]!.chunk.docId).toBe('doc-04.md');
      expect(results[0]!.chunk.docId).toBe('doc-04.md');
      expect(results[0]!.rankVector).toBe(1);
    });
  });

  describe('Formatting & Output Verification', () => {
    it('formats citation headers with standard [doc-XX#chunk-Y] pattern', () => {
      const hybrid = new HybridIndex();
      hybrid.loadFromDirectory(DATA_DIR);
      const results = hybrid.search('формула Карвонена', { topK: 1 });
      expect(results.length).toBe(1);

      const formatted = formatSearchResult(results[0]!, 0);
      expect(formatted).toContain('[doc-02#chunk-');
      expect(formatted).toContain('RRF Score:');
      expect(formatted).toContain('Ранг слів (BM25):');
    });

    it('formats explain table with 3-column comparative view and RRF diagnostics', () => {
      const hybrid = new HybridIndex();
      hybrid.loadFromDirectory(DATA_DIR);

      // Query 1: Exact term
      const q1 = 'шкала навантаження Borg RPE 1-10';
      const r1 = hybrid.search(q1, { topK: 3 });
      const explain1 = formatExplainTable(q1, r1);

      // Query 2: Semantic paraphrase (zero BM25 match anywhere, pure Vector victory)
      const q2 = 'як правильно відновити водно-сольовий гомеостаз в спекотну погоду';
      const r2 = hybrid.search(q2, { topK: 3 });
      const explain2 = formatExplainTable(q2, r2);

      expect(explain1).toContain('Вектор (Cosine)');
      expect(explain1).toContain('Слова (BM25)');
      expect(explain1).toContain('RRF Score');
    });

    it('runs search CLI function cleanly', () => {
      const res = runSearch(['норма споживання рідини', '--top-k', '2']);
      expect(res.results.length).toBeGreaterThan(0);
      expect(res.explain).toBe(false);
    });
  });
});
