import { NextResponse } from 'next/server';
import { analyzeWorkout } from '@/lib/ai';
import type { ExerciseItem } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth';

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
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 });
    }

    const body = (await req.json()) as { exercises?: RawExercisePayload[] };
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

    const analysis = await analyzeWorkout(validExercises);

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (err: unknown) {
    console.error('Analysis error:', err);
    return NextResponse.json(
      { error: 'Failed to analyze workout. Please try again.' },
      { status: 500 }
    );
  }
}
