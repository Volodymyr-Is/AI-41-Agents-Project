import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { retrieveSportsContext } from '../lib/rag-helper';
import { analyzeWorkout } from '../lib/ai';
import { MemoryEntrySchema } from '../src/memory/schema';
import { getHardeningGuard } from '../lib/hardening-runtime';
import type { ExerciseItem } from '../lib/types';

describe('FitPulse AI Lab Integrations (RAG, TTS, Hardening, Metrics, Memory)', () => {
  const savedKeys = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedKeys)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('retrieves relevant sports science protocols via Hybrid RAG index', () => {
    const workout: ExerciseItem[] = [
      { id: '1', type: 'cardio', name: 'Long Distance Run', distance: 12, speed: 10, time: 72 },
      { id: '2', type: 'strength', name: 'Barbell Squats', sets: 4, reps: 8, weight: 80 },
    ];

    const sources = retrieveSportsContext(workout, 3);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0]?.title.length).toBeGreaterThan(0);
    expect(sources[0]?.score).toBeGreaterThan(0);
  });

  it('enriches workout analysis with provider, model, latency, sources, ttsText, traceId, and personal constraints', async () => {
    const workout: ExerciseItem[] = [
      { id: '1', type: 'strength', name: 'Bench Press', sets: 4, reps: 10, weight: 70 },
    ];
    const sources = retrieveSportsContext(workout, 2);

    const analysis = await analyzeWorkout(workout, {
      ragSources: sources,
      constraints: ['Protect right knee, avoid deep squats'],
      traceId: 'trace-fitpulse-001',
    });

    expect(analysis.provider).toBe('Offline Heuristic');
    expect(analysis.model).toBe('rule-based-coach');
    expect(analysis.latencyMs).toBeGreaterThanOrEqual(1);
    expect(analysis.usage?.totalTokens).toBeNull();
    expect(analysis.sources?.length).toBeGreaterThan(0);
    expect(analysis.ttsText).toContain('Workout score:');
    expect(analysis.traceId).toBe('trace-fitpulse-001');
    expect(analysis.improve[0]).toContain('Protect right knee');
  });

  it('enforces MemoryEntrySchema text guard against secrets in athlete constraints', () => {
    expect(MemoryEntrySchema.shape.text.safeParse('Уникати стрибків через коліно').success).toBe(true);
    expect(
      MemoryEntrySchema.shape.text.safeParse('My key is sk-abcdefghijklmnopqrstuvwxyz123456').success
    ).toBe(false);
    expect(MemoryEntrySchema.shape.text.safeParse('A'.repeat(201)).success).toBe(false);
  });

  it('blocks oversized analyze requests via ProductionHardeningGuard', async () => {
    const guard = getHardeningGuard();
    const res = await guard.checkBeforeRun({
      functionId: 'fitpulse-analyze-workout',
      payloadBytes: 5 * 1024 * 1024,
      traceId: 'trace-413-test',
    });

    expect(res.allowed).toBe(false);
    expect(res.httpStatus).toBe(413);
  });
});
