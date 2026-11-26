export const SUPPORTED_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'application/pdf',
] as const;

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

/** Ліміт Vercel Serverless Function body (4.5 MB) */
export const PLATFORM_MAX_BYTES = 4.5 * 1024 * 1024; // 4,718,592 байтів

/**
 * Максимальний сирий розмір бінарного файлу перед base64-кодуванням.
 * Base64 додає ~33.3% оверхеду (4 символи на кожні 3 байти),
 * тому файл розміром понад 3.375 MB у base64 перевищить 4.5 MB.
 */
export const CLIENT_RAW_MAX_BYTES = Math.floor((PLATFORM_MAX_BYTES * 3) / 4); // 3,538,944 байтів

/**
 * Канонічна структура частини повідомлення AI SDK 7 (FilePart).
 * Заборонено використовувати застарілий `{ type: 'image' }` (ImagePart позначений @deprecated).
 */
export interface CanonicalFilePart {
  readonly type: 'file';
  readonly mediaType: SupportedMediaType;
  readonly data:
    | { readonly type: 'data'; readonly data: string | Uint8Array | Buffer }
    | { readonly type: 'url'; readonly url: string };
  readonly filename?: string | undefined;
}

export interface RawFileInput {
  readonly filename: string;
  readonly declaredMediaType: string;
  readonly buffer: Buffer | Uint8Array;
}

export type MultimodalErrorCode =
  | 'EMPTY_FILE'
  | 'PAYLOAD_TOO_LARGE'
  | 'CLIENT_ENCODED_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'MIME_TYPE_SPOOFED'
  | 'UNREADABLE_OR_LOW_QUALITY'
  | 'NON_FITNESS_CONTENT'
  | 'FORBIDDEN_PAID_MODEL';

export interface MultimodalError {
  readonly code: MultimodalErrorCode;
  readonly message: string;
  readonly userAdvice: string;
}

export interface ParsedExercise {
  readonly name: string;
  readonly sets?: number | undefined;
  readonly reps?: number | undefined;
  readonly weightKg?: number | undefined;
  readonly distanceKm?: number | undefined;
  readonly durationMinutes?: number | undefined;
  readonly rpe?: number | undefined; // Rate of Perceived Exertion (1-10)
}

export interface TTSOutput {
  readonly model: 'gemini-2.5-flash-tts';
  readonly text: string;
  readonly voice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede';
  readonly estimatedDurationSec: number;
  readonly audioFormat: 'audio/mp3';
}

export interface MultimodalWorkoutResult {
  readonly success: boolean;
  readonly filePart?: CanonicalFilePart | undefined;
  readonly detectedMediaType?: SupportedMediaType | undefined;
  readonly exercises: readonly ParsedExercise[];
  readonly totalVolumeLoad: number; // кг піднято або км подолано
  readonly aiAnalysis: string;
  readonly tts?: TTSOutput | undefined;
  readonly warning?: string | undefined;
  readonly error?: MultimodalError | undefined;
}

export interface BenchmarkCase {
  readonly id: `mm-${string}`;
  readonly title: string;
  readonly input: RawFileInput;
  readonly expectedStatus: 'success' | 'warning' | 'error';
  readonly expectedErrorCode?: MultimodalErrorCode | undefined;
  readonly description: string;
}
