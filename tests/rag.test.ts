import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BM25Index,
  chunkDocument,
  chunkDocuments,
  cosineSimilarity,
  estimateTokenCount,
  generateFeatureVector,
  HybridIndex,
  loadDocumentsFromDir,
  tokenize,
  VectorStore,
} from '../src/rag';

const DATA_DIR = path.resolve(__dirname, '../docs/lab2/data');

describe('RAG System (Step 04)', () => {
  describe('Document Loading and Chunking', () => {
    it('loads all 10 markdown documents from data directory', () => {
      const docs = loadDocumentsFromDir(DATA_DIR);
      expect(docs.length).toBe(10);
      expect(docs.every((d) => d.id.endsWith('.md'))).toBe(true);
      expect(docs.every((d) => d.content.length > 0)).toBe(true);
      expect(docs.some((d) => d.id === 'doc-01.md')).toBe(true);
      expect(docs.some((d) => d.id === 'doc-10.md')).toBe(true);
    });

    it('estimates token count reasonably', () => {
      const tokens = estimateTokenCount('Основи побудови тренувального мікроциклу для бігунів');
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(30);
    });

    it('chunks a single document while preserving headers and metadata', () => {
      const sampleDoc = {
        id: 'doc-01.md',
        title: '[doc-01] Основи побудови тренувального мікроциклу',
        content: `# [doc-01] Основи побудови тренувального мікроциклу

## 1. Загальні принципи
Тренувальний мікроцикл — це тижневий блок тренувань, що складається з чергування навантаження та відновлення.
Для бігунів-початківців рекомендована структура:
- 3-4 тренування на тиждень;
- Не менше 1 дня повного відпочинку.

## 2. Розподіл обсягу
- Легкий біг: 70-80% від загального тижневого обсягу.
- Інтенсивні навантаження: 15-20%.`,
        path: '/mock/doc-01.md',
      };

      const chunks = chunkDocument(sampleDoc, { maxChunkSize: 300 });
      expect(chunks.length).toBeGreaterThan(0);
      const first = chunks[0]!;
      expect(first.docId).toBe('doc-01.md');
      expect(first.docTitle).toContain('doc-01');
      expect(first.content).toBeTruthy();
    });

    it('chunks all 10 real documents without data loss', () => {
      const docs = loadDocumentsFromDir(DATA_DIR);
      const chunks = chunkDocuments(docs, { maxChunkSize: 450 });
      expect(chunks.length).toBeGreaterThanOrEqual(10);
      // All 10 doc IDs must be represented
      const docIds = new Set(chunks.map((c) => c.docId));
      expect(docIds.size).toBe(10);
    });
  });

  describe('BM25 Lexical Index', () => {
    it('tokenizes Ukrainian and English text correctly', () => {
      const tokens = tokenize('Розрахунок пульсових зон за формулою Karvonen!');
      expect(tokens).toContain('розрахунок');
      expect(tokens).toContain('пульсових');
      expect(tokens).toContain('зон');
      expect(tokens).toContain('формулою');
      expect(tokens).toContain('karvonen');
      expect(tokens).not.toContain('за'); // stopword
    });

    it('finds exact keyword matches and ranks relevant chunks highest', () => {
      const docs = loadDocumentsFromDir(DATA_DIR);
      const chunks = chunkDocuments(docs);
      const bm25 = new BM25Index(chunks);

      const results = bm25.search('формула Карвонена пульс спокою', 3);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.chunk.docId).toBe('doc-02.md');
      expect(results[0]!.score).toBeGreaterThan(0);
    });

    it('returns empty array for non-existent keywords or empty query', () => {
      const docs = loadDocumentsFromDir(DATA_DIR);
      const chunks = chunkDocuments(docs);
      const bm25 = new BM25Index(chunks);

      expect(bm25.search('')).toEqual([]);
      expect(bm25.search('неіснуючийтермін12345')).toEqual([]);
    });
  });

  describe('Vector Store & Cosine Similarity', () => {
    it('calculates cosine similarity accurately', () => {
      const v1 = [1, 0, 0];
      const v2 = [1, 0, 0];
      const v3 = [0, 1, 0];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0);
      expect(cosineSimilarity(v1, v3)).toBeCloseTo(0.0);
    });

    it('creates non-zero feature vectors for text', () => {
      const vec = generateFeatureVector('Гідратація та електроліти під час марафону', 128);
      expect(vec.length).toBe(128);
      const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1.0, 3);
    });

    it('finds semantically related chunks', () => {
      const docs = loadDocumentsFromDir(DATA_DIR);
      const chunks = chunkDocuments(docs);
      const store = new VectorStore(256);
      store.buildIndex(chunks);

      const results = store.search('вода та натрій під час спеки', 3);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.chunk.docId).toBe('doc-04.md');
    });
  });

  describe('Hybrid Search Engine', () => {
    it('initializes and searches across the 10 corpus documents', () => {
      const hybrid = new HybridIndex();
      hybrid.loadFromDirectory(DATA_DIR);

      const stats = hybrid.getStats();
      expect(stats.chunkCount).toBeGreaterThanOrEqual(10);
      expect(stats.vocabularySize).toBeGreaterThan(100);

      // Query 1: Borg RPE scale -> doc-10.md
      const rpeResults = hybrid.search('шкала навантаження Borg RPE 1-10', { topK: 3 });
      expect(rpeResults.length).toBeGreaterThan(0);
      expect(rpeResults[0]!.chunk.docId).toBe('doc-10.md');

      // Query 2: Carbohydrate loading -> doc-09.md
      const carbResults = hybrid.search('вуглеводне завантаження перед марафоном', { topK: 3 });
      expect(carbResults.length).toBeGreaterThan(0);
      expect(carbResults[0]!.chunk.docId).toBe('doc-09.md');

      // Query 3: Overtraining diagnosis -> doc-07.md
      const overtrainResults = hybrid.search('ознаки перетренованості та пульс спокою', { topK: 3 });
      expect(overtrainResults.length).toBeGreaterThan(0);
      expect(overtrainResults[0]!.chunk.docId).toBe('doc-07.md');
    });
  });
});
