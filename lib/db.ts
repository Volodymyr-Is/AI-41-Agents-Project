import fs from 'fs';
import path from 'path';
import type { DatabaseSchema, User, WorkoutSession } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const initialData: DatabaseSchema = {
      users: [],
      workouts: [],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as DatabaseSchema;
  } catch {
    const fallback: DatabaseSchema = { users: [], workouts: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
}

function saveDb(data: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getUsers(): User[] {
  const db = ensureDb();
  return db.users;
}

export function getUserByUsername(username: string): User | undefined {
  const db = ensureDb();
  return db.users.find(
    (u) => u.username.trim().toLowerCase() === username.trim().toLowerCase()
  );
}

export function getUserById(id: string): User | undefined {
  const db = ensureDb();
  return db.users.find((u) => u.id === id);
}

export function createUser(user: User): User {
  const db = ensureDb();
  db.users.push(user);
  saveDb(db);
  return user;
}

export function getWorkoutsByUserId(userId: string): WorkoutSession[] {
  const db = ensureDb();
  return db.workouts
    .filter((w) => w.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getWorkoutById(id: string, userId: string): WorkoutSession | undefined {
  const db = ensureDb();
  return db.workouts.find((w) => w.id === id && w.userId === userId);
}

export function saveWorkout(workout: WorkoutSession): WorkoutSession {
  const db = ensureDb();
  const existingIdx = db.workouts.findIndex((w) => w.id === workout.id);
  if (existingIdx >= 0) {
    db.workouts[existingIdx] = workout;
  } else {
    db.workouts.unshift(workout);
  }
  saveDb(db);
  return workout;
}

export function deleteWorkout(id: string, userId: string): boolean {
  const db = ensureDb();
  const initialLength = db.workouts.length;
  db.workouts = db.workouts.filter((w) => !(w.id === id && w.userId === userId));
  if (db.workouts.length !== initialLength) {
    saveDb(db);
    return true;
  }
  return false;
}
