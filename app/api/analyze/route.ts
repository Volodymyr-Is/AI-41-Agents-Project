import crypto from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { analyzeWorkout } from '@/lib/ai';
import type { ExerciseItem } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth';
import { getConstraintsByUserId } from '@/lib/db';
import { retrieveSportsContext } from '@/lib/rag-helper';
import { getHardeningGuard } from '@/lib/hardening-runtime';
import { langfuseSpanProcessor } from '@/src/otel/langfuse';

export const maxDuration = 60;

interface RawExercisePayload {
  id?: string;
  type?: string;
  name?: string;
  sets?: number | string;
  reps?: number | string;
  weight?: number | string;
  distance?: number | string;
  speed?: number | string;
  time?: number | string;
  notes?: string;
}

export async function POST(req: Request) {
  // Реєструємо скидання спанів OTLP до виклику моделі (вимога serverless Vercel)
  after(async () => {
    await langfuseSpanProcessor.forceFlush();
  });

  const traceId = crypto.randomUUID().replace(/-/g, '');

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 });
    }

    const rawBody = await req.text();
    const payloadBytes = Buffer.byteLength(rawBody, 'utf-8');

    // Зміцнення деплою (Крок 06): перевірка ліміту тіла, Kill Switch та денної стелі витрат
    const guard = getHardeningGuard();
    const decision = await guard.checkBeforeRun({
      functionId: 'fitpulse-analyze-workout',
      payloadBytes,
      traceId,
    });

    if (!decision.allowed) {
      return NextResponse.json(
        {
          error: decision.reason ?? 'Request blocked by production hardening guard.',
          code: decision.code,
          traceId,
        },
        { status: decision.httpStatus }
      );
    }

    const body = JSON.parse(rawBody || '{}') as { exercises?: RawExercisePayload[] };
    const { exercises } = body;

    if (!exercises || !Array.isArray(exercises) || exercises.length === 0) {
      return NextResponse.json(
        { error: 'Please add at least one exercise block to analyze.' },
        { status: 400 }
      );
    }

    const validExercises: ExerciseItem[] = exercises.map((item, idx) => {
      if (item.type === 'cardio') {
        return {
          id: item.id || `cardio_${idx}_${Date.now()}`,
          type: 'cardio' as const,
          name: item.name?.trim() || 'Cardio Session',
          distance: Number(item.distance) || 0,
          speed: Number(item.speed) || 0,
          time: Number(item.time) || 0,
          notes: item.notes || '',
        };
      }
      return {
        id: item.id || `strength_${idx}_${Date.now()}`,
        type: 'strength' as const,
        name: item.name?.trim() || 'Strength Exercise',
        sets: Number(item.sets) || 1,
        reps: Number(item.reps) || 1,
        weight: item.weight ? Number(item.weight) : undefined,
        notes: item.notes || '',
      };
    });

    // RAG (ЛР 2): підтягуємо релевантні протоколи зі спортивної бази знань
    const ragSources = retrieveSportsContext(validExercises, 3);

    // Пам'ять обмежень спортсмена (ЛР 4, Крок 04)
    const userConstraints = getConstraintsByUserId(user.id).map((c) => c.text);

    const analysis = await analyzeWorkout(validExercises, {
      ragSources,
      constraints: userConstraints,
      traceId,
    });

    await guard.recordSuccess({
      functionId: 'fitpulse-analyze-workout',
      traceId,
      tokensUsed: analysis.usage?.totalTokens ?? 0,
      costUsd: 0, // Free Tier (OpenRouter Gemma 4 / heuristic)
    });

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (err: unknown) {
    console.error('Analysis error:', err);
    return NextResponse.json(
      { error: 'Failed to analyze workout. Please try again.', traceId },
      { status: 500 }
    );
  }
}
