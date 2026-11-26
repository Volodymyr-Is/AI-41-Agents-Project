import { describe, it, expect } from 'vitest';
import {
  detectMagicMediaType,
  validateAndBuildFilePart,
  buildFreeTTSOutput,
  processMultimodalWorkout,
} from '../src/multimodal/processor';
import {
  BENCHMARK_DATASET,
  createMockFileBuffer,
  runMultimodalBenchmark,
} from '../src/multimodal/benchmark';
import { CLIENT_RAW_MAX_BYTES, PLATFORM_MAX_BYTES } from '../src/multimodal/types';

describe('Multimodal System (Step 05)', () => {
  describe('Magic Bytes & Security Validation', () => {
    it('accurately identifies PNG, JPEG, and PDF magic signatures', () => {
      const png = createMockFileBuffer('png', 100);
      const jpeg = createMockFileBuffer('jpeg', 100);
      const pdf = createMockFileBuffer('pdf', 100);
      const fake = createMockFileBuffer('fake', 100);

      expect(detectMagicMediaType(png)).toBe('image/png');
      expect(detectMagicMediaType(jpeg)).toBe('image/jpeg');
      expect(detectMagicMediaType(pdf)).toBe('application/pdf');
      expect(detectMagicMediaType(fake)).toBeNull();
    });

    it('rejects spoofed MIME types where declared extension differs from binary header', () => {
      const spoofedInput = {
        filename: 'malicious.png',
        declaredMediaType: 'image/png',
        buffer: Buffer.from('FAKE_HEADER_JUST_TEXT'),
      };

      const result = validateAndBuildFilePart(spoofedInput);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error.code).toBe('MIME_TYPE_SPOOFED');
      }
    });

    it('rejects empty files (0 bytes)', () => {
      const emptyInput = {
        filename: 'empty.jpg',
        declaredMediaType: 'image/jpeg',
        buffer: Buffer.alloc(0),
      };

      const result = validateAndBuildFilePart(emptyInput);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error.code).toBe('EMPTY_FILE');
      }
    });

    it('enforces platform size limits (4.5 MB) and client base64 pre-check', () => {
      const oversizedRaw = Buffer.alloc(PLATFORM_MAX_BYTES + 10);
      oversizedRaw[0] = 0xff;
      oversizedRaw[1] = 0xd8;
      oversizedRaw[2] = 0xff;

      const resOversized = validateAndBuildFilePart({
        filename: 'too-big.jpg',
        declaredMediaType: 'image/jpeg',
        buffer: oversizedRaw,
      });

      expect('error' in resOversized).toBe(true);
      if ('error' in resOversized) {
        expect(resOversized.error.code).toBe('PAYLOAD_TOO_LARGE');
      }

      // Файл, який у сирому вигляді < 4.5 MB, але в base64 > 4.5 MB
      const borderlineRaw = Buffer.alloc(CLIENT_RAW_MAX_BYTES + 1000);
      borderlineRaw[0] = 0xff;
      borderlineRaw[1] = 0xd8;
      borderlineRaw[2] = 0xff;

      const resBorderline = validateAndBuildFilePart({
        filename: 'borderline.jpg',
        declaredMediaType: 'image/jpeg',
        buffer: borderlineRaw,
      });

      expect('error' in resBorderline).toBe(true);
      if ('error' in resBorderline) {
        expect(resBorderline.error.code).toBe('CLIENT_ENCODED_TOO_LARGE');
      }
    });
  });

  describe('AI SDK 7 Canonical FilePart Structure', () => {
    it('creates canonical FilePart with mediaType and data, avoiding deprecated ImagePart', () => {
      const input = {
        filename: 'workout.png',
        declaredMediaType: 'image/png',
        buffer: createMockFileBuffer('png', 500),
      };

      const result = validateAndBuildFilePart(input);
      expect('filePart' in result).toBe(true);
      if ('filePart' in result) {
        const part = result.filePart;
        expect(part.type).toBe('file');
        expect(part.mediaType).toBe('image/png');
        expect(part.data.type).toBe('data');
        // Переконуємось, що немає застарілої структури { type: 'image' }
        expect((part as unknown as { type: string }).type).not.toBe('image');
      }
    });
  });

  describe('Free Tier TTS & Paid Model Prevention', () => {
    it('accepts free tier model gemini-2.5-flash-tts', () => {
      const result = buildFreeTTSOutput('Спортивний підсумок тренування', 'gemini-2.5-flash-tts');
      expect('tts' in result).toBe(true);
      if ('tts' in result) {
        expect(result.tts.model).toBe('gemini-2.5-flash-tts');
        expect(result.tts.audioFormat).toBe('audio/mp3');
      }
    });

    it('strictly forbids paid gemini-2.5-pro-preview-tts model to keep zero cost', () => {
      const result = buildFreeTTSOutput('Текст', 'gemini-2.5-pro-preview-tts');
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error.code).toBe('FORBIDDEN_PAID_MODEL');
      }
    });
  });

  describe('End-to-End Multimodal Workout Processing', () => {
    it('processes a gym session with exercises and calculates volume load', async () => {
      const input = {
        filename: 'gym-diary.jpg',
        declaredMediaType: 'image/jpeg',
        buffer: createMockFileBuffer('jpeg', 200 * 1024),
      };

      const result = await processMultimodalWorkout(input, {
        metadata: {
          customExercises: [
            { name: 'Присідання', sets: 5, reps: 5, weightKg: 100 },
            { name: 'Жим лежачи', sets: 4, reps: 8, weightKg: 80 },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.exercises).toHaveLength(2);
      // 5*5*100 = 2500, 4*8*80 = 2560 -> всього 5060 кг
      expect(result.totalVolumeLoad).toBe(5060);
      expect(result.aiAnalysis).toMatch(/5[\s\u00A0]060 кг/);
      expect(result.tts).toBeDefined();
      expect(result.tts?.model).toBe('gemini-2.5-flash-tts');
    });

    it('rejects non-fitness content with clear user guidance', async () => {
      const input = {
        filename: 'receipt.jpg',
        declaredMediaType: 'image/jpeg',
        buffer: createMockFileBuffer('jpeg', 100 * 1024),
      };

      const result = await processMultimodalWorkout(input, {
        metadata: { isNonFitness: true },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NON_FITNESS_CONTENT');
      expect(result.error?.userAdvice).toContain('тренувального');
    });
  });

  describe('Benchmark Dataset (10 Canonical Cases: mm-01 .. mm-10)', () => {
    it('contains exactly 10 diverse benchmark cases', () => {
      expect(BENCHMARK_DATASET).toHaveLength(10);
      const ids = BENCHMARK_DATASET.map((c) => c.id);
      expect(ids).toEqual([
        'mm-01',
        'mm-02',
        'mm-03',
        'mm-04',
        'mm-05',
        'mm-06',
        'mm-07',
        'mm-08',
        'mm-09',
        'mm-10',
      ]);
    });

    it('passes all 10 benchmark test cases (10/10 green)', async () => {
      const report = await runMultimodalBenchmark();
      expect(report.totalCases).toBe(10);
      expect(report.passedCount).toBe(10);

      for (const res of report.cases) {
        expect(res.matchedExpected).toBe(true);
      }
    });
  });
});
