import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  PLATFORM_HOBBY_LIMITS,
  createSafeTelemetryConfig,
} from '../src/hardening/config';
import {
  InMemoryHardeningStore,
  ProductionHardeningGuard,
} from '../src/hardening/guard';
import { runSecretsAudit } from '../src/hardening/secrets-audit';

describe('Production Hardening (Step 06)', () => {
  describe('Vercel Hobby Platform Limits & Telemetry Privacy', () => {
    it('defines exact 4 Vercel Hobby platform constants', () => {
      expect(PLATFORM_HOBBY_LIMITS.maxDurationSec).toBe(300);
      expect(PLATFORM_HOBBY_LIMITS.memoryMb).toBe(2048);
      expect(PLATFORM_HOBBY_LIMITS.vCpu).toBe(1);
      expect(PLATFORM_HOBBY_LIMITS.maxPayloadBytes).toBe(4.5 * 1024 * 1024);
      expect(PLATFORM_HOBBY_LIMITS.defaultRegion).toBe('iad1');
    });

    it('enforces recordInputs=false and recordOutputs=false in telemetry config', () => {
      const cfg = createSafeTelemetryConfig('lab4-sport-diary-agent');
      expect(cfg.isEnabled).toBe(true);
      expect(cfg.recordInputs).toBe(false);
      expect(cfg.recordOutputs).toBe(false);
      expect(cfg.functionId).toBe('lab4-sport-diary-agent');
    });

    it('requires functionId for bidirectional trace linking', () => {
      expect(() => createSafeTelemetryConfig('')).toThrow(/functionId/);
    });
  });

  describe('Kill Switch & Fail-Closed Protection', () => {
    it('blocks requests with 503 when kill switch is turned off', async () => {
      const store = new InMemoryHardeningStore();
      store.enabled = false;
      const guard = new ProductionHardeningGuard(store, store, {
        maxTokensPerDay: 100_000,
        maxUsdPerDay: 1.0,
        maxRequestsPerDay: 100,
      });

      const decision = await guard.checkBeforeRun({
        functionId: 'sport-agent',
        payloadBytes: 1024,
        traceId: 'trace-kill-01',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.httpStatus).toBe(503);
      expect(decision.code).toBe('KILL_SWITCH_ACTIVE');
    });

    it('fails closed (503) when kill switch config store is unreachable', async () => {
      const store = new InMemoryHardeningStore();
      store.throwOnRead = true;
      const guard = new ProductionHardeningGuard(store, store, {
        maxTokensPerDay: 100_000,
        maxUsdPerDay: 1.0,
        maxRequestsPerDay: 100,
      });

      const decision = await guard.checkBeforeRun({
        functionId: 'sport-agent',
        payloadBytes: 512,
        traceId: 'trace-unavail-01',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.httpStatus).toBe(503);
      expect(decision.code).toBe('KILL_SWITCH_UNAVAILABLE');
    });
  });

  describe('Application-Level Spend Limits & Bidirectional Trace Proof', () => {
    it('enforces spend cap (429) and generates limit proof artifact', async () => {
      const store = new InMemoryHardeningStore();
      const guard = new ProductionHardeningGuard(store, store, {
        maxTokensPerDay: 5000,
        maxUsdPerDay: 0.05,
        maxRequestsPerDay: 10,
      });

      // Запит 1: в межах ліміту
      const d1 = await guard.checkBeforeRun({
        functionId: 'sport-diary-workout',
        payloadBytes: 2048,
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      });
      expect(d1.allowed).toBe(true);
      expect(d1.httpStatus).toBe(200);

      const log1 = await guard.recordSuccess({
        functionId: 'sport-diary-workout',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        tokensUsed: 5200, // Перевищує денний ліміт 5000 токенів
        costUsd: 0.015,
      });
      expect(log1.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');

      // Запит 2: заблокований стелею витрат (429 Too Many Requests)
      const d2 = await guard.checkBeforeRun({
        functionId: 'sport-diary-workout',
        payloadBytes: 1024,
        traceId: '80f198ee56343ba864fe8b2a57d3eff7',
      });
      expect(d2.allowed).toBe(false);
      expect(d2.httpStatus).toBe(429);
      expect(d2.code).toBe('SPEND_LIMIT_EXCEEDED');

      // Збереження доказу спрацювання ліміту в docs/lab4/hardening-limit-proof.json
      const proofPath = path.resolve(process.cwd(), 'docs/lab4/hardening-limit-proof.json');
      const proofData = {
        generatedAt: new Date().toISOString(),
        scenario: 'Application-level Spend Cap Triggered (Hobby Spend Management = N/A)',
        limits: { maxTokensPerDay: 5000, maxUsdPerDay: 0.05, maxRequestsPerDay: 10 },
        allowedRun: log1,
        blockedRun: {
          timestamp: new Date().toISOString(),
          functionId: d2.functionId,
          trace_id: d2.traceId,
          allowed: d2.allowed,
          httpStatus: d2.httpStatus,
          code: d2.code,
          reason: d2.reason,
          snapshot: d2.snapshot,
        },
      };
      fs.writeFileSync(proofPath, JSON.stringify(proofData, null, 2) + '\n', 'utf-8');
      expect(fs.existsSync(proofPath)).toBe(true);
    });

    it('rejects oversized payload (> 4.5 MB) with 413 status', async () => {
      const store = new InMemoryHardeningStore();
      const guard = new ProductionHardeningGuard(store, store, {
        maxTokensPerDay: 10_000,
        maxUsdPerDay: 1.0,
        maxRequestsPerDay: 10,
      });

      const decision = await guard.checkBeforeRun({
        functionId: 'sport-diary-upload',
        payloadBytes: 5 * 1024 * 1024, // 5 MB > 4.5 MB
        traceId: 'trace-413',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.httpStatus).toBe(413);
      expect(decision.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Secrets & Repository Hygiene Audit', () => {
    it('passes full secrets audit across gitignore, .env.example, and source files', () => {
      const report = runSecretsAudit(process.cwd());
      expect(report.gitignoreProtected).toBe(true);
      expect(report.envExampleSafe).toBe(true);
      expect(report.findings).toHaveLength(0);
      expect(report.passed).toBe(true);
      expect(report.scannedFilesCount).toBeGreaterThan(10);
    });
  });
});
