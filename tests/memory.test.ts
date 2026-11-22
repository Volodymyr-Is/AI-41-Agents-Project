import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  MemoryEntrySchema,
  MemoryEntry,
} from '../src/memory/schema';
import {
  appendMemoryEntry,
  readMemoryEntries,
  isRecordStale,
} from '../src/memory/store';
import {
  verifyGitQuote,
  verifyGitBlame,
  runDeepResearch,
} from '../src/memory/deep-research';
import { runMemoryBenchmark } from '../scripts/memory/benchmark';

const TEST_DIR = path.resolve(process.cwd(), 'docs/lab4/memory/test-scratch');
const TEST_STORE = path.join(TEST_DIR, 'test-store.jsonl');

function cleanTestFiles(): void {
  if (fs.existsSync(TEST_STORE)) {
    try {
      fs.unlinkSync(TEST_STORE);
    } catch {
      // ignore
    }
  }
  if (fs.existsSync(TEST_DIR)) {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

describe('Memory System (Step 04)', () => {
  beforeEach(() => {
    cleanTestFiles();
  });

  afterEach(() => {
    cleanTestFiles();
  });

  describe('MemoryEntrySchema & Security', () => {
    it('accepts valid memory entries for all kinds', () => {
      const validEntry: MemoryEntry = {
        at: new Date().toISOString(),
        kind: 'decision',
        text: 'Використовуємо fail-closed валідатор границь рядка для уникнення регресій.',
        sha: '4ff48cec099f0514c3e9bbca18706c9c21122bfb',
        repo: 'fork',
        paths: ['src/index.ts'],
        source: 'architect-agent',
      };

      const parsed = MemoryEntrySchema.parse(validEntry);
      expect(parsed.kind).toBe('decision');
      expect(parsed.repo).toBe('fork');
    });

    it('rejects text exceeding 200 characters', () => {
      const longText = 'A'.repeat(201);
      expect(() =>
        MemoryEntrySchema.parse({
          at: new Date().toISOString(),
          kind: 'constraint',
          text: longText,
          sha: '4ff48cec099f0514c3e9bbca18706c9c21122bfb',
          repo: 'course',
          paths: ['src/index.ts'],
          source: 'test',
        })
      ).toThrow(/at most 200 characters/);
    });

    it('rejects entries containing API secrets and personal data', () => {
      const forbiddenSamples = [
        'Google secret: AIzaSyD3xYz1234567890abcdefghijklmnopqr',
        'OpenAI key: sk-abcdefghijklmnopqrstuvwxyz1234567890',
        'GitHub token: ghp_1234567890abcdefghijklmnopqrstuvwxyz',
        'Private key: -----BEGIN PRIVATE KEY----- secret -----END PRIVATE KEY-----',
        'Contact developer at admin@example.com for access',
      ];

      for (const text of forbiddenSamples) {
        expect(() =>
          MemoryEntrySchema.parse({
            at: new Date().toISOString(),
            kind: 'constraint',
            text,
            sha: '4ff48cec099f0514c3e9bbca18706c9c21122bfb',
            repo: 'course',
            paths: ['src/index.ts'],
            source: 'security-agent',
          })
        ).toThrow(/forbidden content/);
      }
    });

    it('rejects invalid SHAs or missing paths', () => {
      expect(() =>
        MemoryEntrySchema.parse({
          at: new Date().toISOString(),
          kind: 'outcome',
          text: 'Valid short outcome text',
          sha: 'not-a-hex-sha!',
          repo: 'course',
          paths: ['src/index.ts'],
          source: 'test',
        })
      ).toThrow(/hexadecimal/);

      expect(() =>
        MemoryEntrySchema.parse({
          at: new Date().toISOString(),
          kind: 'outcome',
          text: 'Valid text',
          sha: '4ff48cec099f0514c3e9bbca18706c9c21122bfb',
          repo: 'course',
          paths: [],
          source: 'test',
        })
      ).toThrow(/at least one path/);
    });
  });

  describe('Deterministic Store & Bounded Context Limits', () => {
    it('appends and reads entries with K-record limits', () => {
      for (let i = 1; i <= 5; i++) {
        appendMemoryEntry(
          {
            at: new Date().toISOString(),
            kind: i % 2 === 0 ? 'decision' : 'constraint',
            text: `Запис пам'яті номер ${i}`,
            sha: '4ff48cec099f0514c3e9bbca18706c9c21122bfb',
            repo: 'course',
            paths: ['package.json'],
            source: `agent-${i}`,
          },
          TEST_STORE
        );
      }

      // Читання з maxEntries (K = 2)
      const res = readMemoryEntries({ maxEntries: 2, filterStale: false }, TEST_STORE);
      expect(res.totalStored).toBe(5);
      expect(res.returnedCount).toBe(2);
      expect(res.entries).toHaveLength(2);
      expect(res.entries[1]?.text).toContain('номер 5');
    });

    it('truncates by byte budget (B-byte limit) and reports truncated bytes', () => {
      for (let i = 1; i <= 3; i++) {
        appendMemoryEntry(
          {
            at: new Date().toISOString(),
            kind: 'outcome',
            text: `Довгий результат експерименту номер ${i} для перевірки байтового ліміту пам'яті`,
            sha: '4ff48cec099f0514c3e9bbca18706c9c21122bfb',
            repo: 'course',
            paths: ['package.json'],
            source: 'benchmark',
          },
          TEST_STORE
        );
      }

      // Обмежуємо 450 байтами (поміститься лише 1 запис, решта 2 відсікаються)
      const res = readMemoryEntries({ maxBytes: 450, filterStale: false }, TEST_STORE);
      expect(res.totalStored).toBe(3);
      expect(res.returnedCount).toBe(1);
      expect(res.truncatedBytes).toBeGreaterThan(0);
      expect(res.summary).toContain('truncated');
    });

    it('detects staleness when commits modified target path', () => {
      const mockResolver = () => process.cwd();

      // Запис з дуже давнім commit hash (або неіснуючим), де файл гарантовано змінювався
      const oldEntry: MemoryEntry = {
        at: new Date().toISOString(),
        kind: 'constraint',
        text: 'Тестове обмеження',
        sha: '0000000000000000000000000000000000000000',
        repo: 'course',
        paths: ['package.json'],
        source: 'audit',
      };

      const isStale = isRecordStale(oldEntry, mockResolver);
      expect(isStale).toBe(true);
    });
  });

  describe('Deep Research & Quote Verification', () => {
    it('deterministically verifies git cat-file quotes', () => {
      const msRepo = 'C:\\Users\\volod\\OneDrive\\Документи\\GitHub\\ms';
      if (!fs.existsSync(msRepo)) {
        return; // Пропускаємо, якщо середовище без шляху до ms
      }

      const res = verifyGitQuote(
        msRepo,
        '4ff48cec099f0514c3e9bbca18706c9c21122bfb',
        'src/index.ts',
        'str.length > 100'
      );

      expect(res.verified).toBe(true);
      expect(res.detail).toContain('Exact match confirmed');
    });

    it('rejects unverified or hallucinated quotes', () => {
      const msRepo = 'C:\\Users\\volod\\OneDrive\\Документи\\GitHub\\ms';
      if (!fs.existsSync(msRepo)) {
        return;
      }

      const res = verifyGitQuote(
        msRepo,
        '4ff48cec099f0514c3e9bbca18706c9c21122bfb',
        'src/index.ts',
        'this_string_never_existed_in_source_code_at_all()'
      );

      expect(res.verified).toBe(false);
      expect(res.detail).toContain('Snippet not found');
    });

    it('verifies git blame lines', () => {
      const msRepo = 'C:\\Users\\volod\\OneDrive\\Документи\\GitHub\\ms';
      if (!fs.existsSync(msRepo)) {
        return;
      }

      const res = verifyGitBlame(msRepo, 'src/index.ts', 70, 74);
      expect(res.verified).toBe(true);
      expect(res.output.length).toBeGreaterThan(0);
    });

    it('runs deep research and satisfies 4-line stopping criterion', () => {
      const msRepo = 'C:\\Users\\volod\\OneDrive\\Документи\\GitHub\\ms';
      if (!fs.existsSync(msRepo)) {
        return;
      }

      const outcome = runDeepResearch(
        msRepo,
        'Чому в ms було встановлено ліміт str.length > 100?'
      );

      expect(outcome.lanes.length).toBeGreaterThanOrEqual(4);
      expect(outcome.stoppingConditions).toHaveLength(4);
      expect(outcome.stoppingCriterionMet).toBe(true);
      expect(outcome.verifiedQuotes[0]?.verified).toBe(true);
    });

    it('executes comparative benchmark and populates store.jsonl', () => {
      const res = runMemoryBenchmark();
      expect(res.comparison.withoutMemory.toolCalls).toBeGreaterThan(
        res.comparison.withMemory.toolCalls
      );
      expect(res.comparison.withMemory.avoidedRepeatedFailure).toBe(true);
      expect(res.comparison.withoutMemory.avoidedRepeatedFailure).toBe(false);
      expect(res.deepResearchSummary.stoppingCriterionMet).toBe(true);

      const storePath = path.resolve(process.cwd(), 'docs/lab4/memory/store.jsonl');
      expect(fs.existsSync(storePath)).toBe(true);
      const lines = fs.readFileSync(storePath, 'utf-8').trim().split('\n');
      expect(lines.length).toBe(3);
    });
  });
});
