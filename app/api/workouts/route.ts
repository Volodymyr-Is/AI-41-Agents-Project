import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getWorkoutsByUserId, saveWorkout } from '@/lib/db';
import type { AIAnalysis, ExerciseItem, WorkoutSession } from '@/lib/types';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workouts = getWorkoutsByUserId(user.id);
    return NextResponse.json({ workouts });
  } catch (err: unknown) {
    console.error('Fetch workouts error:', err);
    return NextResponse.json({ error: 'Failed to fetch workouts' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      title?: string;
      exercises?: ExerciseItem[];
      analysis?: AIAnalysis;
      date?: string;
    };
    const { title, exercises, analysis, date } = body;

    if (!exercises || !Array.isArray(exercises) || exercises.length === 0) {
      return NextResponse.json(
        { error: 'Workout must contain at least one exercise' },
        { status: 400 }
      );
    }

    const todayStr = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    const newWorkout: WorkoutSession = {
      id: 'wo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: user.id,
      title: title?.trim() || `Workout on ${new Date().toLocaleDateString()}`,
      date: date || todayStr,
      exercises,
      analysis,
      createdAt: new Date().toISOString(),
    };

    saveWorkout(newWorkout);

    return NextResponse.json({ success: true, workout: newWorkout }, { status: 201 });
  } catch (err: unknown) {
    console.error('Save workout error:', err);
    return NextResponse.json({ error: 'Failed to save workout' }, { status: 500 });
  }
}
