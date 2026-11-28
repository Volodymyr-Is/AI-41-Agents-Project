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

export interface RagCitation {
  id: string;
  title: string;
  snippet: string;
  score: number;
}

export interface AIUsageMetrics {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface AIAnalysis {
  remove: string[];
  improve: string[];
  add: string[];
  summary: string;
  score: number;
  estimatedRecoveryHours: number;
  tags?: string[] | undefined;
  analyzedAt: string;
  provider?: string | undefined;
  model?: string | undefined;
  latencyMs?: number | undefined;
  usage?: AIUsageMetrics | undefined;
  sources?: RagCitation[] | undefined;
  ttsText?: string | undefined;
  traceId?: string | undefined;
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

export interface AthleteConstraint {
  id: string;
  userId: string;
  text: string;
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
  constraints?: AthleteConstraint[] | undefined;
}
