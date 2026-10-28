import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('record-gates.mjs', () => {
  let tempBase: string;
  let runDir: string;
  let gateRecordPath: string;

  beforeEach(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'gates-test-'));
    runDir = join(tempBase, 'runs', 't-01-mock');
    gateRecordPath = join(tempBase, 'gate-record.json');

    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'run.json'),
      JSON.stringify(
        {
          task_id: 't-test',
          artifact_dir: 'runs/t-01-mock',
          gates: {},
        },
        null,
        2
      )
    );
  });

  afterEach(() => {
    if (existsSync(tempBase)) {
      rmSync(tempBase, { recursive: true, force: true });
    }
  });

  it('записує pass для всіх успішних брам та генерує gate-record.json', () => {
    const scriptPath = join(process.cwd(), 'scripts', 'harness', 'record-gates.mjs');
    execFileSync(
      process.execPath,
      [
        scriptPath,
        '--root',
        join(tempBase, 'runs'),
        '--out',
        gateRecordPath,
        '--types',
        'success',
        '--lint',
        'success',
        '--tests',
        'success',
        '--build',
        'success',
        '--run-url',
        'https://example.com/actions/runs/123',
      ],
      { encoding: 'utf8' }
    );

    const record = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'));
    expect(record.gates).toEqual({
      types: 'pass',
      lint: 'pass',
      tests: 'pass',
      build: 'pass',
    });
    expect(record.ci_run_url).toBe('https://example.com/actions/runs/123');

    const gateRecord = JSON.parse(readFileSync(gateRecordPath, 'utf8'));
    expect(gateRecord.task_id).toBe('t-test');
    expect(gateRecord.gates.types).toBe('pass');
  });

  it('коректно фіксує fail та skipped для впалих брам', () => {
    const scriptPath = join(process.cwd(), 'scripts', 'harness', 'record-gates.mjs');
    execFileSync(
      process.execPath,
      [
        scriptPath,
        '--root',
        join(tempBase, 'runs'),
        '--out',
        gateRecordPath,
        '--types',
        'failure',
        '--lint',
        'skipped',
        '--tests',
        'skipped',
        '--build',
        'skipped',
        '--run-url',
        'https://example.com/actions/runs/456',
      ],
      { encoding: 'utf8' }
    );

    const record = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'));
    expect(record.gates).toEqual({
      types: 'fail',
      lint: 'skipped',
      tests: 'skipped',
      build: 'skipped',
    });
  });
});
