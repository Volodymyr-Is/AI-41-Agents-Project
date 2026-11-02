import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildConfusionMatrix,
  calculateAgreement,
  calculateAsymmetry,
  buildJudgePrompt,
  loadJudgeCases,
  runJudgeCalibration,
  type JudgeCase,
  type Label,
} from '../../scripts/judge/calibrate';

describe('scripts/judge/calibrate', () => {
  it('buildConfusionMatrix коректно будує матрицю 3x3', () => {
    const pairs: { mine: Label; judge: Label }[] = [
      { mine: 'pass', judge: 'pass' },
      { mine: 'pass', judge: 'pass' },
      { mine: 'pass', judge: 'fail' }, // false alarm
      { mine: 'fail', judge: 'fail' },
      { mine: 'fail', judge: 'pass' }, // pass-through
      { mine: 'unknown', judge: 'unknown' },
    ];

    const matrix = buildConfusionMatrix(pairs);

    expect(matrix.pass.pass).toBe(2);
    expect(matrix.pass.fail).toBe(1);
    expect(matrix.pass.unknown).toBe(0);

    expect(matrix.fail.pass).toBe(1);
    expect(matrix.fail.fail).toBe(1);
    expect(matrix.fail.unknown).toBe(0);

    expect(matrix.unknown.pass).toBe(0);
    expect(matrix.unknown.fail).toBe(0);
    expect(matrix.unknown.unknown).toBe(1);
  });

  it('calculateAsymmetry точно розраховує pass-throughs та false alarms', () => {
    const pairs = [
      { case_id: 'c1', mine: 'pass' as const, judge: 'pass' as const },
      { case_id: 'c2', mine: 'pass' as const, judge: 'fail' as const }, // false alarm
      { case_id: 'c3', mine: 'fail' as const, judge: 'fail' as const },
      { case_id: 'c4', mine: 'fail' as const, judge: 'pass' as const }, // pass through
      { case_id: 'c5', mine: 'fail' as const, judge: 'fail' as const },
    ];

    const asymmetry = calculateAsymmetry(pairs);

    expect(asymmetry.passThroughs).toHaveLength(1);
    expect(asymmetry.passThroughs[0]?.case_id).toBe('c4');
    // 1 pass-through з 3 fail випадків = 33.3%
    expect(asymmetry.passThroughRate).toBeCloseTo(1 / 3, 3);

    expect(asymmetry.falseAlarms).toHaveLength(1);
    expect(asymmetry.falseAlarms[0]?.case_id).toBe('c2');
    // 1 false alarm з 2 pass випадків = 50%
    expect(asymmetry.falseAlarmRate).toBeCloseTo(1 / 2, 3);
  });

  it('calculateAgreement обчислює сиру згоду, випадкову згоду та каппу Коена', () => {
    // Ідеальна згода
    const perf = calculateAgreement(['pass', 'fail', 'unknown'], ['pass', 'fail', 'unknown']);
    expect(perf.raw).toBe(1.0);
    expect(perf.kappa).toBe(1.0);

    // Звичайна згода
    const mine: Label[] = ['pass', 'pass', 'pass', 'pass', 'fail', 'fail', 'fail', 'fail', 'unknown', 'unknown'];
    const judge: Label[] = ['pass', 'pass', 'pass', 'fail', 'fail', 'fail', 'fail', 'pass', 'unknown', 'unknown'];
    const res = calculateAgreement(mine, judge);

    expect(res.n).toBe(10);
    expect(res.raw).toBe(0.8); // 8 з 10 збіглися
    expect(res.expected).toBeGreaterThan(0.3);
    expect(res.kappa).toBeGreaterThan(0.6); // суттєва згода
  });

  it('calculateAgreement кидає помилку при різній кількості елементів', () => {
    expect(() => calculateAgreement(['pass'], ['pass', 'fail'])).toThrow(
      'Довжини масивів розмітки повинні співпадати та бути більше 0'
    );
  });

  it('buildJudgePrompt формує структурований промпт із виміром та артефактом', () => {
    const caseItem: JudgeCase = {
      case_id: 'case-test',
      task_id: 't-test',
      dimension: 'safety',
      criterion: 'Відсутність секретів',
      artifact: 'const key = "123";',
      mine: 'fail',
      holdout: false,
    };

    const prompt = buildJudgePrompt(caseItem);
    expect(prompt).toContain('ID випадку: "case-test"');
    expect(prompt).toContain('Вимір якості (dimension): "safety"');
    expect(prompt).toContain('Критерій оцінки: "Відсутність секретів"');
    expect(prompt).toContain('const key = "123";');
    expect(prompt).toContain('"verdict": "pass" | "fail" | "unknown"');
  });

  it('loadJudgeCases коректно завантажує датасет із docs/lab3/judge-cases.jsonl', () => {
    const filePath = join(process.cwd(), 'docs', 'lab3', 'judge-cases.jsonl');
    const cases = loadJudgeCases(filePath);

    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.length).toBe(22);

    const devCases = cases.filter((c) => !c.holdout);
    const holdoutCases = cases.filter((c) => c.holdout);

    expect(devCases.length).toBe(16);
    expect(holdoutCases.length).toBe(6);

    // Перевіряємо наявність обов'язкових вимірів
    const dimensions = new Set(cases.map((c) => c.dimension));
    expect(dimensions.has('correctness')).toBe(true);
    expect(dimensions.has('boundary')).toBe(true);
    expect(dimensions.has('safety')).toBe(true);
    expect(dimensions.has('style')).toBe(true);
    expect(dimensions.has('reproducibility')).toBe(true);
  });

  it('runJudgeCalibration успішно калібрує суддю з мокованим API без мережі', async () => {
    const casesPath = join(process.cwd(), 'docs', 'lab3', 'judge-cases.jsonl');

    // Мок fetchFn повертає відповідні валідні вердикти
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = JSON.parse(init?.body as string);
      const userMsg = body.messages[0].content as string;
      const match = userMsg.match(/ID випадку: "([^"]+)"/);
      const caseId = match ? match[1] : 'unknown';

      // Для більшості кейсів повертаємо вердикт, схожий на реальність
      let v: Label = 'pass';
      if (['case-02', 'case-03', 'case-05', 'case-08', 'case-10', 'case-11', 'case-13', 'case-16', 'case-18', 'case-20'].includes(caseId!)) {
        v = 'fail';
      } else if (['case-21', 'case-22'].includes(caseId!)) {
        v = 'unknown';
      }

      const resBody = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                case_id: caseId,
                verdict: v,
                reason: `Автоматична оцінка для ${caseId}`,
                evidence: 'line 1',
              }),
            },
          },
        ],
      };

      return new Response(JSON.stringify(resBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const tempDir = mkdtempSync(join(tmpdir(), 'judge-test-'));
    const tempVerdictsPath = join(tempDir, 'judge.jsonl');

    try {
      const res = await runJudgeCalibration(casesPath, tempVerdictsPath, {
        fetchFn: mockFetch as typeof fetch,
        refresh: true,
        apiKey: 'mock-key',
      });

      expect(res.totalCases).toBe(22);
      expect(res.overall.raw).toBeGreaterThanOrEqual(0.9);
      expect(res.overall.kappa).toBeGreaterThanOrEqual(0.85);
      expect(res.devAgreement.n).toBe(16);
      expect(res.holdoutAgreement.n).toBe(6);
      expect(res.dimensionStats.length).toBe(5);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
