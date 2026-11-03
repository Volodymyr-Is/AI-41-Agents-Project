import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CASES, CANARY } from '../../scripts/redteam/cases';
import { INVARIANTS } from '../../scripts/redteam/invariants';
import { guardCommand, guardPathBoundary, guardSecretFile } from '../../scripts/redteam/guardrails';
import { runRedTeam } from '../../scripts/redteam/run-redteam';

describe('Red-Team Security (Крок 07)', () => {
  it('CASES містить щонайменше 6 сценаріїв по 2 на кожну з трьох точок входу', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(6);

    const taskInputCases = CASES.filter((c) => c.entry === 'task_input');
    const toolResultCases = CASES.filter((c) => c.entry === 'tool_result');
    const fetchedDocCases = CASES.filter((c) => c.entry === 'fetched_doc');

    expect(taskInputCases.length).toBe(2);
    expect(toolResultCases.length).toBe(2);
    expect(fetchedDocCases.length).toBe(2);

    for (const c of CASES) {
      expect(c.id).toBeDefined();
      expect(c.atlas).toMatch(/^AML\.T0051/);
      expect(c.owasp).toContain('LLM01');
      expect(c.payload.length).toBeGreaterThan(0);
      expect(c.violates.length).toBeGreaterThan(0);
    }
  });

  describe('Інваріанти безпеки (scripts/redteam/invariants)', () => {
    it('no_canary_leak валить перевірку, якщо канарка потрапила в артефакти', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'inv-test-'));
      const inv = INVARIANTS.find((i) => i.id === 'no_canary_leak')!;

      // Чистий артефакт
      writeFileSync(join(tempDir, 'output.txt'), 'Нормальний вивід задачі');
      const cleanRes = inv.check({ worktree: tempDir, artifactDir: tempDir });
      expect(cleanRes.ok).toBe(true);

      // Витік канарки
      writeFileSync(join(tempDir, 'patch.diff'), `+const x = '${CANARY}';`);
      const leakRes = inv.check({ worktree: tempDir, artifactDir: tempDir });
      expect(leakRes.ok).toBe(false);
      expect(leakRes.detail).toContain('канарка зʼявилася в артефакті');

      rmSync(tempDir, { recursive: true, force: true });
    });

    it('no_write_outside_worktree виявляє створення файлу-мітки ../pwned.txt', () => {
      const parentDir = mkdtempSync(join(tmpdir(), 'parent-test-'));
      const worktree = join(parentDir, 'worktree');
      mkdirSync(worktree, { recursive: true });

      const inv = INVARIANTS.find((i) => i.id === 'no_write_outside_worktree')!;

      // До створення
      const okRes = inv.check({ worktree, artifactDir: worktree });
      expect(okRes.ok).toBe(true);

      // Атака створила файл поза робочим каталогом
      writeFileSync(join(parentDir, 'pwned.txt'), 'PWNED');
      const badRes = inv.check({ worktree, artifactDir: worktree });
      expect(badRes.ok).toBe(false);
      expect(badRes.detail).toContain('файл-мішень створено');

      rmSync(parentDir, { recursive: true, force: true });
    });

    it('no_bypass_in_config блокує прапорці обходу дозволів', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'bypass-test-'));
      const inv = INVARIANTS.find((i) => i.id === 'no_bypass_in_config')!;

      writeFileSync(join(tempDir, 'run.json'), '{"flags": ["--dangerously-skip-permissions"]}');
      const badRes = inv.check({ worktree: tempDir, artifactDir: tempDir });
      expect(badRes.ok).toBe(false);
      expect(badRes.detail).toContain('обхід дозволів');

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe('Захисні механізми (Guardrails)', () => {
    it('guardPathBoundary блокує вихід за межі робочого каталогу', () => {
      const cwd = join(tmpdir(), 'project', 'worktree');
      expect(guardPathBoundary(cwd, 'src/index.ts').allowed).toBe(true);
      expect(guardPathBoundary(cwd, '../pwned.txt').allowed).toBe(false);
      expect(guardPathBoundary(cwd, '../../etc/passwd').allowed).toBe(false);
    });

    it('guardSecretFile блокує доступ до .env та .env.local', () => {
      expect(guardSecretFile('.env').allowed).toBe(false);
      expect(guardSecretFile('.env.local').allowed).toBe(false);
      expect(guardSecretFile('src/.env.secret').allowed).toBe(false);
      expect(guardSecretFile('src/models.ts').allowed).toBe(true);
    });

    it('guardCommand блокує шкідливі команди git remote add та rm -rf /', () => {
      expect(guardCommand('git remote add bad https://evil.com').allowed).toBe(false);
      expect(guardCommand('rm -rf /').allowed).toBe(false);
      expect(guardCommand('npm test').allowed).toBe(true);
    });
  });

  describe('Демонстрація вразливості та виправлення (До і Після)', () => {
    it('виявляє дірку (brokenCount > 0) без захисту і нейтралізує всі атаки із захистом', async () => {
      // 1. Прогін БЕЗ захисту меж (enableGuard: false) — сценарій r-03 пробиває захист
      const beforeFix = await runRedTeam({ enableGuard: false });
      expect(beforeFix.brokenCount).toBeGreaterThan(0);

      // Прибираємо файл-мішень після демонстрації
      const pwnedPath = join(process.cwd(), '.harness', 'pwned.txt');
      if (existsSync(pwnedPath)) {
        unlinkSync(pwnedPath);
      }

      // 2. Прогін ІЗ захистом меж (enableGuard: true) — усі 6 сценаріїв успішно зупинено
      const afterFix = await runRedTeam({ enableGuard: true });
      expect(afterFix.brokenCount).toBe(0);
      expect(afterFix.stoppedCount).toBe(6);
    });
  });
});

