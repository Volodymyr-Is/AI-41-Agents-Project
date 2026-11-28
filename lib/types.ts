export type ExerciseType = 'strength' | 'cardio';

export interface StrengthExercise {
  id: string;
  type: 'strength';
  name: string;
  sets: number;
  reps: number;
  weight?: number | undefined;
  notes?: string | undefined;
}

export interface CardioExercise {
  id: string;
  type: 'cardio';
  name: string;
  distance: number;
  speed: number;
  time: number;
  notes?: string | undefined;
}

export type ExerciseItem = StrengthExercise | CardioExercise;

export interface AIAnalysis {
  remove: string[];
  improve: string[];
  add: string[];
  summary: string;
  score: number;
  estimatedRecoveryHours: number;
  tags?: string[] | undefined;
  analyzedAt: string;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  title: string;
  date: string;
  exercises: ExerciseItem[];
  analysis?: AIAnalysis | undefined;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface DatabaseSchema {
  users: User[];
  workouts: WorkoutSession[];
}
