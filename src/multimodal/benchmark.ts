import { BenchmarkCase, RawFileInput } from './types';
import { processMultimodalWorkout } from './processor';

/** Допоміжна генерація бінарного буфера з правильними Magic Bytes */
export function createMockFileBuffer(
  type: 'png' | 'jpeg' | 'pdf' | 'empty' | 'fake' | 'oversized',
  sizeBytes = 1024
): Buffer {
  if (type === 'empty') {
    return Buffer.alloc(0);
  }

  if (type === 'oversized') {
    // 5.2 MB (перевищує ліміт 4.5 MB)
    const buf = Buffer.alloc(5.2 * 1024 * 1024);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    return buf;
  }

  if (type === 'fake') {
    // Текстовий вміст без жодних графічних сигнатур
    return Buffer.from('NOT_A_REAL_IMAGE_DATA_JUST_SOME_ASCII_TEXT_MIME_SPOOFING_TEST');
  }

  const buf = Buffer.alloc(sizeBytes);
  if (type === 'png') {
    buf[0] = 0x89;
    buf[1] = 0x50; // P
    buf[2] = 0x4e; // N
    buf[3] = 0x47; // G
    buf[4] = 0x0d;
    buf[5] = 0x0a;
    buf[6] = 0x1a;
    buf[7] = 0x0a;
  } else if (type === 'jpeg') {
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
  } else if (type === 'pdf') {
    buf[0] = 0x25; // %
    buf[1] = 0x50; // P
    buf[2] = 0x44; // D
    buf[3] = 0x46; // F
    buf[4] = 0x2d; // -
  }

  return buf;
}

/**
 * Еталонний набір із 10 власних тест-кейсів (mm-01 .. mm-10) для Кроку 05.
 */
export const BENCHMARK_DATASET: readonly BenchmarkCase[] = [
  {
    id: 'mm-01',
    title: 'Чітке фото сторінки бігового щоденника (JPEG)',
    input: {
      filename: 'running-log-clear.jpg',
      declaredMediaType: 'image/jpeg',
      buffer: createMockFileBuffer('jpeg', 450 * 1024),
    },
    expectedStatus: 'success',
    description: 'Канонічний успішний шлях для фотографії високої якості.',
  },
  {
    id: 'mm-02',
    title: 'Скан таблиці силових тренувань (PNG)',
    input: {
      filename: 'gym-workout-scan.png',
      declaredMediaType: 'image/png',
      buffer: createMockFileBuffer('png', 320 * 1024),
    },
    expectedStatus: 'success',
    description: 'Успішне розпізнавання сканованої таблиці силових вправ.',
  },
  {
    id: 'mm-03',
    title: 'PDF-документ тижневого тренувального мікроциклу',
    input: {
      filename: 'weekly-plan-microcycle.pdf',
      declaredMediaType: 'application/pdf',
      buffer: createMockFileBuffer('pdf', 210 * 1024),
    },
    expectedStatus: 'success',
    description: 'Коректна робота з PDF-файлами спортивних планів через FilePart.',
  },
  {
    id: 'mm-04',
    title: 'Фото заниженої якості / розмитий рукописний запис',
    input: {
      filename: 'blurry-handwritten-log.jpg',
      declaredMediaType: 'image/jpeg',
      buffer: createMockFileBuffer('jpeg', 180 * 1024),
    },
    expectedStatus: 'warning',
    description: 'Успішне виконання з додаванням попередження користувачу про низьку якість.',
  },
  {
    id: 'mm-05',
    title: 'Фото щоденника під кутом та при слабкому освітленні',
    input: {
      filename: 'angled-dark-photo.png',
      declaredMediaType: 'image/png',
      buffer: createMockFileBuffer('png', 290 * 1024),
    },
    expectedStatus: 'warning',
    description: 'Неідеальні умови зйомки: вилучення даних з поміткою про можливі неточності.',
  },
  {
    id: 'mm-06',
    title: 'Непідтримуваний формат файлу (.csv)',
    input: {
      filename: 'export.csv',
      declaredMediaType: 'text/csv',
      buffer: Buffer.from('date,exercise,reps\n2026-11-22,Squat,5'),
    },
    expectedStatus: 'error',
    expectedErrorCode: 'UNSUPPORTED_MEDIA_TYPE',
    description: 'Блокування непідтримуваних медіатипів із підказкою дозволених форматів.',
  },
  {
    id: 'mm-07',
    title: 'Порожній файл (0 байтів)',
    input: {
      filename: 'empty-file.jpg',
      declaredMediaType: 'image/jpeg',
      buffer: createMockFileBuffer('empty'),
    },
    expectedStatus: 'error',
    expectedErrorCode: 'EMPTY_FILE',
    description: 'Перехоплення 0-байтових пошкоджених файлів без падіння сервера.',
  },
  {
    id: 'mm-08',
    title: 'Файл, що перевищує ліміт платформи (5.2 MB > 4.5 MB)',
    input: {
      filename: 'huge-raw-scan.jpg',
      declaredMediaType: 'image/jpeg',
      buffer: createMockFileBuffer('oversized'),
    },
    expectedStatus: 'error',
    expectedErrorCode: 'PAYLOAD_TOO_LARGE',
    description: 'Запобігання 413 FUNCTION_PAYLOAD_TOO_LARGE до відправки на Vercel.',
  },
  {
    id: 'mm-09',
    title: 'Скан без спортивних даних (фіскальний чек з магазину)',
    input: {
      filename: 'store-receipt.jpg',
      declaredMediaType: 'image/jpeg',
      buffer: createMockFileBuffer('jpeg', 150 * 1024),
    },
    expectedStatus: 'error',
    expectedErrorCode: 'NON_FITNESS_CONTENT',
    description: 'Семантична перевірка: відхилення нерелевантних зображень із порадою.',
  },
  {
    id: 'mm-10',
    title: 'Підроблений MIME-тип (використання розширення .png для тексту)',
    input: {
      filename: 'malicious-or-corrupt.png',
      declaredMediaType: 'image/png',
      buffer: createMockFileBuffer('fake'),
    },
    expectedStatus: 'error',
    expectedErrorCode: 'MIME_TYPE_SPOOFED',
    description: 'Захист від MIME-спуфінгу: перевірка магічних байтів відхиляє підробку.',
  },
];

export interface BenchmarkRunReport {
  readonly totalCases: number;
  readonly passedCount: number;
  readonly cases: {
    readonly id: string;
    readonly title: string;
    readonly status: 'success' | 'warning' | 'error';
    readonly matchedExpected: boolean;
    readonly details: string;
  }[];
}

/**
 * Прогін усіх 10 тест-кейсів мультимодального еталонного набору.
 */
export async function runMultimodalBenchmark(): Promise<BenchmarkRunReport> {
  const results = [];

  for (const c of BENCHMARK_DATASET) {
    const outcome = await processMultimodalWorkout(c.input, {
      metadata: {
        isLowQuality: c.id === 'mm-04' || c.id === 'mm-05',
        isNonFitness: c.id === 'mm-09',
      },
    });

    let status: 'success' | 'warning' | 'error' = 'success';
    if (!outcome.success) {
      status = 'error';
    } else if (outcome.warning) {
      status = 'warning';
    }

    const matchedExpected =
      status === c.expectedStatus &&
      (!c.expectedErrorCode || outcome.error?.code === c.expectedErrorCode);

    results.push({
      id: c.id,
      title: c.title,
      status,
      matchedExpected,
      details: outcome.error ? outcome.error.message : outcome.aiAnalysis.slice(0, 100),
    });
  }

  const passedCount = results.filter((r) => r.matchedExpected).length;

  return {
    totalCases: BENCHMARK_DATASET.length,
    passedCount,
    cases: results,
  };
}
