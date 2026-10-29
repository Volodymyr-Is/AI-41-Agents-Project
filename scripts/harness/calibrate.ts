import { agreement, evaluateCriterion, type CriterionVerdict, type Label } from './verifier';

export interface CalibrationCase {
  id: string;
  task: string;
  criterion: {
    id: string;
    description: string;
    expectedEvidence: string;
  };
  artifact: {
    diff: string;
    files: Record<string, string>;
  };
  humanVerdict: Label;
  expectedReason: string;
}

export const CALIBRATION_CASES: CalibrationCase[] = [
  // 1. t-01: Експорт функції calculateMetCalories (PASS)
  {
    id: 'case-01',
    task: 't-01 (MET калорії)',
    criterion: {
      id: 'crit-export-met',
      description: 'Функція calculateMetCalories експортована з коректними типами аргументів (met, weightKg, durationMinutes)',
      expectedEvidence: 'export function calculateMetCalories у src/utils/met-calc.ts',
    },
    artifact: {
      diff: `+export function calculateMetCalories(met: number, weightKg: number, durationMinutes: number): number {`,
      files: {
        'src/utils/met-calc.ts': `export function calculateMetCalories(met: number, weightKg: number, durationMinutes: number): number {\n  if (met <= 0 || weightKg <= 0 || durationMinutes <= 0) throw new Error('Параметри мають бути додатними');\n  const cal = met * weightKg * (durationMinutes / 60);\n  return Math.round(cal * 10) / 10;\n}`,
      },
    },
    humanVerdict: 'pass',
    expectedReason: 'Функція присутня, експортована та типізована',
  },
  // 2. t-01: Формула та округлення (PASS)
  {
    id: 'case-02',
    task: 't-01 (MET калорії)',
    criterion: {
      id: 'crit-formula-met',
      description: 'Формула калорій: met * weightKg * (durationMinutes / 60) з округленням до 1 знака',
      expectedEvidence: 'рядок розрахунку cal та Math.round(cal * 10) / 10',
    },
    artifact: {
      diff: `+  const cal = met * weightKg * (durationMinutes / 60);\n+  return Math.round(cal * 10) / 10;`,
      files: {
        'src/utils/met-calc.ts': `  const cal = met * weightKg * (durationMinutes / 60);\n  return Math.round(cal * 10) / 10;`,
      },
    },
    humanVerdict: 'pass',
    expectedReason: 'Формула відповідає специфікації MET',
  },
  // 3. t-01: Валідація від\'ємних значень (PASS)
  {
    id: 'case-03',
    task: 't-01 (MET калорії)',
    criterion: {
      id: 'crit-validate-met',
      description: 'Валідація викидає помилку при від\'ємних або нульових значеннях параметрів',
      expectedEvidence: 'if (met <= 0 || weightKg <= 0 || durationMinutes <= 0) throw new Error(...)',
    },
    artifact: {
      diff: `+  if (met <= 0 || weightKg <= 0 || durationMinutes <= 0) throw new Error('Параметри мають бути додатними');`,
      files: {
        'src/utils/met-calc.ts': `  if (met <= 0 || weightKg <= 0 || durationMinutes <= 0) throw new Error('Параметри мають бути додатними');`,
      },
    },
    humanVerdict: 'pass',
    expectedReason: 'Перевірка викидає виняток на некоректні дані',
  },
  // 4. t-01: Наявність юніт-тестів (PASS)
  {
    id: 'case-04',
    task: 't-01 (MET калорії)',
    criterion: {
      id: 'crit-tests-met',
      description: 'Наявність юніт-тестів на граничні значення та формулу у tests/met-calc.test.ts',
      expectedEvidence: 'тести describe/it у tests/met-calc.test.ts',
    },
    artifact: {
      diff: `+describe('calculateMetCalories', () => {\n+  it('розраховує калорії', () => expect(calculateMetCalories(8, 70, 30)).toBe(280));\n+});`,
      files: {
        'tests/met-calc.test.ts': `describe('calculateMetCalories', () => {\n  it('розраховує калорії', () => expect(calculateMetCalories(8, 70, 30)).toBe(280));\n  it('викидає помилку на <= 0', () => expect(() => calculateMetCalories(0, 70, 30)).toThrow());\n});`,
      },
    },
    humanVerdict: 'pass',
    expectedReason: 'Тести покривають позитивний та негативний сценарії',
  },
  // 5. t-02: Zod-схема пульсових зон (PASS)
  {
    id: 'case-05',
    task: 't-02 (Пульсові зони)',
    criterion: {
      id: 'crit-hr-schema',
      description: 'HeartRateZoneSchema валідує zone (1-5), minBpm (40-220), maxBpm (40-220) та minBpm <= maxBpm',
      expectedEvidence: 'z.object з refine для minBpm <= maxBpm у src/validators/heart-rate.ts',
    },
    artifact: {
      diff: `+export const HeartRateZoneSchema = z.object({\n+  zone: z.number().int().min(1).max(5),\n+  minBpm: z.number().min(40).max(220),\n+  maxBpm: z.number().min(40).max(220),\n+}).refine(d => d.minBpm <= d.maxBpm);`,
      files: {
        'src/validators/heart-rate.ts': `export const HeartRateZoneSchema = z.object({\n  zone: z.number().int().min(1).max(5),\n  minBpm: z.number().min(40).max(220),\n  maxBpm: z.number().min(40).max(220),\n}).refine(d => d.minBpm <= d.maxBpm);`,
      },
    },
    humanVerdict: 'pass',
    expectedReason: 'Схема Zod містить усі вказані обмеження',
  },
  // 6. t-03: Розрахунок тоннажу (FAIL — навмисна помилка у формулі)
  {
    id: 'case-06',
    task: 't-03 (Тоннаж Volume Load)',
    criterion: {
      id: 'crit-tonnage-formula',
      description: 'Volume Load розраховується як сума добутків sets * reps * weightKg',
      expectedEvidence: 'сумування reps * weightKg для кожного підходу',
    },
    artifact: {
      diff: `+export function calculateVolumeLoad(sets: Array<{ reps: number; weightKg: number }>): number {\n+  return sets.reduce((acc, s) => acc + s.reps + s.weightKg, 0); // ПОМИЛКА: додавання замість множення\n+}`,
      files: {
        'src/utils/volume-load.ts': `export function calculateVolumeLoad(sets: Array<{ reps: number; weightKg: number }>): number {\n  return sets.reduce((acc, s) => acc + s.reps + s.weightKg, 0);\n}`,
      },
    },
    humanVerdict: 'fail',
    expectedReason: 'Формула хибна: виконується додавання reps + weightKg замість множення reps * weightKg',
  },
  // 7. t-03: Відсутність валідації від\'ємної ваги (FAIL)
  {
    id: 'case-07',
    task: 't-03 (Тоннаж Volume Load)',
    criterion: {
      id: 'crit-tonnage-negatives',
      description: 'Функція викидає помилку на від\'ємні значення reps або weightKg',
      expectedEvidence: 'перевірка s.reps < 0 || s.weightKg < 0 з throw Error',
    },
    artifact: {
      diff: `+export function calculateVolumeLoad(sets: Array<{ reps: number; weightKg: number }>): number {\n+  return sets.reduce((acc, s) => acc + s.reps * s.weightKg, 0);\n+}`,
      files: {
        'src/utils/volume-load.ts': `export function calculateVolumeLoad(sets: Array<{ reps: number; weightKg: number }>): number {\n  return sets.reduce((acc, s) => acc + s.reps * s.weightKg, 0);\n}`,
      },
    },
    humanVerdict: 'fail',
    expectedReason: 'Валідація від\'ємних значень повністю відсутня',
  },
  // 8. t-04: Формат бігового темпу (FAIL — пропущено форматування MM:SS)
  {
    id: 'case-08',
    task: 't-04 (Темп бігу)',
    criterion: {
      id: 'crit-pace-format',
      description: 'Темп повертається рядком у форматі MM:SS (наприклад "05:30")',
      expectedEvidence: 'форматування padStart(2, "0") для хвилин та секунд',
    },
    artifact: {
      diff: `+export function calculatePace(distanceKm: number, durationSeconds: number) {\n+  const pace = (durationSeconds / 60) / distanceKm;\n+  return { paceMinutesPerKm: String(pace), speedKmH: (distanceKm / durationSeconds) * 3600 };\n+}`,
      files: {
        'src/utils/pace-calc.ts': `export function calculatePace(distanceKm: number, durationSeconds: number) {\n  const pace = (durationSeconds / 60) / distanceKm;\n  return { paceMinutesPerKm: String(pace), speedKmH: (distanceKm / durationSeconds) * 3600 };\n}`,
      },
    },
    humanVerdict: 'fail',
    expectedReason: 'Темп повертається як десятковий дріб у String(), а не у форматі MM:SS',
  },
  // 9. t-05: Оцінка HRR (UNKNOWN — файл відновлення не створено в артефакті)
  {
    id: 'case-09',
    task: 't-05 (Heart Rate Recovery)',
    criterion: {
      id: 'crit-hrr-thresholds',
      description: 'Пороги індексу відновлення: <12 poor, 12-20 normal, >20 excellent у src/utils/hrr-calc.ts',
      expectedEvidence: 'умовні конструкції з poor/normal/excellent у src/utils/hrr-calc.ts',
    },
    artifact: {
      diff: `+// TODO: реалізація буде в наступному коміті`,
      files: {},
    },
    humanVerdict: 'unknown',
    expectedReason: 'У наданому артефакті файл src/utils/hrr-calc.ts відсутній, неможливо оцінити логіку',
  },
  // 10. t-06: Валідатор тривалості Zod (UNKNOWN — відсутня реалізація durationToSeconds)
  {
    id: 'case-10',
    task: 't-06 (Тривалість HH:MM:SS)',
    criterion: {
      id: 'crit-duration-to-seconds',
      description: 'Функція durationToSeconds переводить валідний рядок HH:MM:SS у число секунд',
      expectedEvidence: 'експорт та реалізація durationToSeconds(duration: string): number',
    },
    artifact: {
      diff: `+export const DurationSchema = z.string().regex(/^\\d{2}:\\d{2}:\\d{2}$/);`,
      files: {
        'src/validators/duration.ts': `export const DurationSchema = z.string().regex(/^\\d{2}:\\d{2}:\\d{2}$/);`,
      },
    },
    humanVerdict: 'unknown',
    expectedReason: 'Схема створена, але функція durationToSeconds відсутня в артефакті змін',
  },
];

export async function runCalibration() {
  console.log('=== Запуск калібрування верифікатора на 10 випадках ===');
  const mine: Label[] = [];
  const judge: Label[] = [];
  const verdicts: CriterionVerdict[] = [];

  for (const [i, c] of CALIBRATION_CASES.entries()) {
    console.log(`[${i + 1}/${CALIBRATION_CASES.length}] Оцінка ${c.id}: ${c.criterion.id}...`);
    mine.push(c.humanVerdict);

    try {
      const v = await evaluateCriterion(c.criterion, c.artifact);
      judge.push(v.verdict);
      verdicts.push(v);
      console.log(`   -> Людина: ${c.humanVerdict} | Суддя: ${v.verdict} | Збіг: ${c.humanVerdict === v.verdict ? 'ТАК' : 'НІ'}`);
    } catch (err) {
      console.error(`   Помилка оцінки ${c.id}:`, err);
      judge.push('unknown');
      verdicts.push({
        id: c.criterion.id,
        verdict: 'unknown',
        reason: 'Помилка під час звернення до судді',
        evidence: '',
      });
    }
  }

  const stats = agreement(mine, judge);
  console.log('\n=== Результати узгодженості ===');
  console.log(`Випадків: ${stats.n}`);
  console.log(`Сира згода (Po): ${(stats.raw * 100).toFixed(1)}% (${stats.raw})`);
  console.log(`Очікувана випадкова згода (Pe): ${(stats.expected * 100).toFixed(1)}% (${stats.expected.toFixed(4)})`);
  console.log(`Каппа Коена (kappa): ${stats.kappa.toFixed(4)}`);

  return { CALIBRATION_CASES, mine, judge, verdicts, stats };
}

if (process.argv[1]?.includes('calibrate')) {
  runCalibration().catch(console.error);
}
