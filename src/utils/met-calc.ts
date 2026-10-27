export function calculateMetCalories(met: number, weightKg: number, durationMinutes: number): number {
  if (met <= 0) {
    throw new Error('MET must be a positive number');
  }
  if (weightKg <= 0) {
    throw new Error('Weight must be a positive number');
  }
  if (durationMinutes <= 0) {
    throw new Error('Duration must be a positive number');
  }

  const calories = met * weightKg * (durationMinutes / 60);
  return Math.round(calories * 10) / 10;
}