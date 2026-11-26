import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeStepUsage,
  aggregateTotalUsage,
  verifyTotalUsageMatchesSteps,
  runCostAuditConfig,
} from '../scripts/harness/cost';
import { generateCostReport } from '../scripts/harness/cost-report';

describe('Cost Audit (Step 07)', () => {
  describe('Usage Normalization & Unreported Fields', () => {
    it('keeps undefined provider fields as null (never coerces to 0)', () => {
      const normalized = normalizeStepUsage({
        inputTokens: 300,
        outputTokens: 80,
        cacheReadInputTokens: undefined,
        cacheWriteInputTokens: undefined,
        reasoningTokens: undefined,
      });

      expect(normalized.inputTokens).toBe(300);
      expect(normalized.outputTokens).toBe(80);
      expect(normalized.cacheReadInputTokens).toBeNull();
      expect(normalized.cacheWriteInputTokens).toBeNull();
      expect(normalized.reasoningTokens).toBeNull();
    });

    it('aggregates totalUsage across all steps and detects last-step-only bug', () => {
      const step1 = normalizeStepUsage({
        inputTokens: 400,
        outputTokens: 100,
        cacheReadInputTokens: 150,
      });
      const step2 = normalizeStepUsage({
        inputTokens: 600,
        outputTokens: 120,
        cacheReadInputTokens: 250,
      });

      const total = aggregateTotalUsage([step1, step2]);
      expect(total.inputTokens).toBe(1000);
      expect(total.outputTokens).toBe(220);
      expect(total.cacheReadInputTokens).toBe(400);
      expect(total.reasoningTokens).toBeNull();

      // Перевірка узгодженості
      expect(verifyTotalUsageMatchesSteps([step1, step2], total)).toBe(true);
      // Якщо випадково передали usage останнього кроку (step2) замість totalUsage — тест ловить баг
      expect(verifyTotalUsageMatchesSteps([step1, step2], step2)).toBe(false);
    });
  });

  describe('Config A vs B Benchmark & Automated Report Generation', () => {
    it('executes both configs A and B, writes JSONL traces, and generates docs/lab4/cost.md', () => {
      const pathA = path.resolve(process.cwd(), 'docs/lab4/traces/cost-A-runs.jsonl');
      const pathB = path.resolve(process.cwd(), 'docs/lab4/traces/cost-B-runs.jsonl');
      const reportPath = path.resolve(process.cwd(), 'docs/lab4/cost.md');

      const recordsA = runCostAuditConfig('A', pathA);
      const recordsB = runCostAuditConfig('B', pathB);

      expect(recordsA).toHaveLength(5);
      expect(recordsB).toHaveLength(5);
      expect(fs.existsSync(pathA)).toBe(true);
      expect(fs.existsSync(pathB)).toBe(true);

      const { summaryA, summaryB, markdown } = generateCostReport(pathA, pathB, reportPath);

      // Перевіряємо порівняння: А має вищий passRate і менше токенів на пройдену задачу
      expect(summaryA.passRatePct).toBe(100);
      expect(summaryB.passRatePct).toBe(80);
      expect(summaryA.tokensPerPassedTask).toBeLessThan(summaryB.tokensPerPassedTask);
      expect(summaryA.totalRetries).toBe(0);
      expect(summaryB.totalRetries).toBeGreaterThan(0);

      // Перевіряємо структуру згенерованого документа
      expect(fs.existsSync(reportPath)).toBe(true);
      expect(markdown).toContain('не повідомлено');
      expect(markdown).toContain('Повідомленість полів провайдером');
      expect(markdown).toContain('Токенів на 1 пройдену задачу');
      expect(markdown).toContain('Модальності та ембединги');
      expect(markdown).toContain('Прогноз масштабування');
    });
  });
});
