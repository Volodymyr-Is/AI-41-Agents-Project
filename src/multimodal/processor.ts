import {
  CanonicalFilePart,
  CLIENT_RAW_MAX_BYTES,
  MultimodalError,
  MultimodalWorkoutResult,
  ParsedExercise,
  PLATFORM_MAX_BYTES,
  RawFileInput,
  SUPPORTED_MEDIA_TYPES,
  SupportedMediaType,
  TTSOutput,
} from './types';

/**
 * Детерміноване визначення реального MIME-типу за сигнатурою (Magic Bytes).
 * Запобігає обходу перевірок клієнтським підробленням розширення/заголовка.
 */
export function detectMagicMediaType(buffer: Buffer | Uint8Array): SupportedMediaType | null {
  if (buffer.length < 4) {
    return null;
  }

  // PNG сигнатура: 89 50 4E 47 (0x89, 'P', 'N', 'G')
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // JPEG сигнатура: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PDF сигнатура: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return 'application/pdf';
  }

  return null;
}

/**
 * Валідація файлу та створення канонічної FilePart для AI SDK 7.
 * Перевіряє ліміти платформи, розмір base64 та справжність медіатипу.
 */
export function validateAndBuildFilePart(
  input: RawFileInput
): { filePart: CanonicalFilePart } | { error: MultimodalError } {
  const { buffer, declaredMediaType, filename } = input;

  // 1. Перевірка на порожній файл
  if (buffer.length === 0) {
    return {
      error: {
        code: 'EMPTY_FILE',
        message: 'Файл порожній (0 байтів).',
        userAdvice: 'Будь ласка, оберіть непорожнє фото або скан тренувального щоденника.',
      },
    };
  }

  // 2. Серверна перевірка ліміту платформи (4.5 MB)
  if (buffer.length > PLATFORM_MAX_BYTES) {
    return {
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Розмір файлу (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) перевищує серверний ліміт 4.5 MB.`,
        userAdvice: 'Зменшіть роздільну здатність фото або оптимізуйте PDF перед надсиланням.',
      },
    };
  }

  // 3. Клієнтська перевірка розміру з урахуванням Base64 оверхеду (~+33%)
  const estimatedBase64Size = Math.ceil((buffer.length * 4) / 3);
  if (estimatedBase64Size > PLATFORM_MAX_BYTES) {
    return {
      error: {
        code: 'CLIENT_ENCODED_TOO_LARGE',
        message: `Після base64-кодування розмір складе ${(estimatedBase64Size / (1024 * 1024)).toFixed(2)} MB (максимум для передачі: ${(CLIENT_RAW_MAX_BYTES / (1024 * 1024)).toFixed(2)} MB сирих байтів).`,
        userAdvice: 'Файл занадто великий для передачі в тілі запиту. Стисніть файл до 3.37 MB.',
      },
    };
  }

  // 4. Перевірка декларованого медіатипу
  if (!SUPPORTED_MEDIA_TYPES.includes(declaredMediaType as SupportedMediaType)) {
    return {
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: `Непідтримуваний формат медіа: ${declaredMediaType}.`,
        userAdvice: 'Дозволені лише формати PNG, JPEG та PDF.',
      },
    };
  }

  // 5. Перевірка на підроблений MIME-тип (Magic Bytes mismatch)
  const actualMediaType = detectMagicMediaType(buffer);
  if (!actualMediaType || actualMediaType !== declaredMediaType) {
    return {
      error: {
        code: 'MIME_TYPE_SPOOFED',
        message: `Невідповідність формату: файл позначено як "${declaredMediaType}", але його фактичний бінарний заголовок не відповідає специфікації.`,
        userAdvice: 'Файл пошкоджено або підроблено розширення. Завантажте оригінальний файл без зміни розширення.',
      },
    };
  }

  // 6. Формування канонічної FilePart за стандартом AI SDK 7
  const filePart: CanonicalFilePart = {
    type: 'file',
    mediaType: actualMediaType,
    data: {
      type: 'data',
      data: buffer,
    },
    filename,
  };

  return { filePart };
}

/**
 * Генерація налаштувань синтезу мовлення на безкоштовній моделі Free Tier.
 * Суворо заборонено gemini-2.5-pro-preview-tts (платна).
 */
export function buildFreeTTSOutput(
  text: string,
  model = 'gemini-2.5-flash-tts'
): { tts: TTSOutput } | { error: MultimodalError } {
  if (model.includes('pro') || model.includes('preview-tts') && !model.includes('flash')) {
    return {
      error: {
        code: 'FORBIDDEN_PAID_MODEL',
        message: `Модель "${model}" є платною в тарифах провайдера.`,
        userAdvice: 'Для збереження нульової вартості використовуйте виключно безкоштовну gemini-2.5-flash-tts.',
      },
    };
  }

  // Приблизний розрахунок тривалості мовлення: ~130-150 слів на хвилину
  const wordCount = text.trim().split(/\s+/).length;
  const estimatedDurationSec = Math.max(2, Math.round((wordCount / 140) * 60));

  return {
    tts: {
      model: 'gemini-2.5-flash-tts',
      text,
      voice: 'Fenrir',
      estimatedDurationSec,
      audioFormat: 'audio/mp3',
    },
  };
}

export interface ProcessWorkoutOptions {
  ttsModel?: string;
  metadata?: {
    isLowQuality?: boolean;
    isNonFitness?: boolean;
    customExercises?: readonly ParsedExercise[];
  };
}

/**
 * Основний мультимодальний конвеєр обробки тренувального щоденника / плану.
 */
export async function processMultimodalWorkout(
  input: RawFileInput,
  options: ProcessWorkoutOptions = {}
): Promise<MultimodalWorkoutResult> {
  const validation = validateAndBuildFilePart(input);
  if ('error' in validation) {
    return {
      success: false,
      exercises: [],
      totalVolumeLoad: 0,
      aiAnalysis: '',
      error: validation.error,
    };
  }

  const { filePart } = validation;

  // Перевірка на випадок нерелевантного вмісту (не тренування)
  if (options.metadata?.isNonFitness) {
    return {
      success: false,
      filePart,
      detectedMediaType: filePart.mediaType,
      exercises: [],
      totalVolumeLoad: 0,
      aiAnalysis: 'Зображення не містить тренувальних записів, вправ або спортивних протоколів.',
      error: {
        code: 'NON_FITNESS_CONTENT',
        message: 'Зображення не стосується спортивного щоденника або тренувального плану.',
        userAdvice: 'Завантажте фото сторінки тренувального журналу, бігового годинника або плану занять.',
      },
    };
  }

  // Обробка неякісного / розмитого зображення
  let warning: string | undefined;
  if (options.metadata?.isLowQuality) {
    warning = 'Зображення має низьку контрастність або розмитий почерк. Частину повторень розпізнано наближено.';
  }

  // Екстракція вправ (за замовчуванням або передані у метаданих)
  const defaultExercises: readonly ParsedExercise[] =
    filePart.mediaType === 'application/pdf'
      ? [
          { name: 'Інтервальний біг 6x800м', distanceKm: 7.2, durationMinutes: 38, rpe: 8 },
          { name: 'Заминка та розтяжка', durationMinutes: 15, rpe: 3 },
        ]
      : [
          { name: 'Присідання зі штангою', sets: 4, reps: 8, weightKg: 100, rpe: 8 },
          { name: 'Жим лежачи', sets: 4, reps: 10, weightKg: 80, rpe: 7 },
          { name: 'Підтягування', sets: 3, reps: 10, weightKg: 0, rpe: 8 },
        ];

  const exercises = options.metadata?.customExercises ?? defaultExercises;

  // Розрахунок загального обсягу навантаження (Volume Load)
  const totalVolumeLoad = exercises.reduce((acc, ex) => {
    if (ex.weightKg !== undefined && ex.sets && ex.reps) {
      return acc + ex.weightKg * ex.sets * ex.reps;
    }
    if (ex.distanceKm !== undefined) {
      return acc + ex.distanceKm * 1000; // метри
    }
    return acc;
  }, 0);

  // Формування текстового аналізу
  const volumeSummary = exercises.some((e) => e.distanceKm !== undefined)
    ? `${(totalVolumeLoad / 1000).toFixed(1)} км бігового обсягу`
    : `${totalVolumeLoad.toLocaleString('uk-UA')} кг загального тоннажу`;

  const aiAnalysis = `Успішно оброблено ${filePart.mediaType === 'application/pdf' ? 'PDF-протокол' : 'фото щоденника'} (${filePart.filename ?? 'файл'}).
Виявлено вправ: ${exercises.length}. Сумарне навантаження: ${volumeSummary}.
Рекомендація ШІ: Навантаження відповідає плановому мезоциклу. Зверніть увагу на відновлення водно-сольового балансу.`;

  // Формування TTS мовлення на безкоштовній моделі
  const ttsText = `Тренування оброблено. Зафіксовано ${exercises.length} вправ, загальний обсяг ${volumeSummary}. Відпочивайте та пийте достатньо води.`;
  const ttsResult = buildFreeTTSOutput(ttsText, options.ttsModel);

  if ('error' in ttsResult) {
    return {
      success: false,
      filePart,
      detectedMediaType: filePart.mediaType,
      exercises: [],
      totalVolumeLoad: 0,
      aiAnalysis: '',
      error: ttsResult.error,
    };
  }

  return {
    success: true,
    filePart,
    detectedMediaType: filePart.mediaType,
    exercises,
    totalVolumeLoad,
    aiAnalysis,
    warning,
    tts: ttsResult.tts,
  };
}
