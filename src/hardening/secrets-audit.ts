import * as fs from 'fs';
import * as path from 'path';

export interface SecretFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
}

export interface SecretsAuditReport {
  readonly gitignoreProtected: boolean;
  readonly envExampleSafe: boolean;
  readonly scannedFilesCount: number;
  readonly findings: readonly SecretFinding[];
  readonly passed: boolean;
}

const SECRET_PATTERNS: readonly { name: string; regex: RegExp }[] = [
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'OpenAI Secret Key', regex: /sk-[a-zA-Z0-9]{20,}/ },
  { name: 'Anthropic Key', regex: /sk-ant-[a-zA-Z0-9\-_]{20,}/ },
  { name: 'GitHub PAT', regex: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'GitHub Fine-grained PAT', regex: /github_pat_[a-zA-Z0-9_]{20,}/ },
  { name: 'Langfuse Secret Key', regex: /sk-lf-[a-f0-9\-]{20,}/ },
  { name: 'Private Key Block', regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
];

/**
 * Рекурсивно збирає файли з директорії, ігноруючи node_modules, .git, .env*, .agent-log.
 */
function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === '.next' ||
      entry.name === '.agent-log' ||
      entry.name.startsWith('.env')
    ) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, acc);
    } else if (
      entry.name.endsWith('.ts') ||
      entry.name.endsWith('.tsx') ||
      entry.name.endsWith('.js') ||
      entry.name.endsWith('.json')
    ) {
      acc.push(fullPath);
    }
  }
  return acc;
}

/**
 * Аудит секретів (без читання .env та .env.local):
 * 1. Перевіряє, що .gitignore містить правила для .env і .env.local.
 * 2. Перевіряє, що .env.example не містить реальних секретів.
 * 3. Сканує директорії коду (src/, app/) на випадок випадково захардкоджених ключів.
 */
export function runSecretsAudit(rootDir: string = process.cwd()): SecretsAuditReport {
  // 1. Перевірка .gitignore
  const gitignorePath = path.join(rootDir, '.gitignore');
  let gitignoreProtected = false;
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf-8');
    gitignoreProtected =
      (gi.includes('.env') || gi.includes('.env*')) &&
      (gi.includes('.env.local') || gi.includes('.env*.local') || gi.includes('.env*'));
  }

  // 2. Перевірка .env.example (секретні змінні мають бути порожніми)
  const envExamplePath = path.join(rootDir, '.env.example');
  let envExampleSafe = false;
  if (fs.existsSync(envExamplePath)) {
    const lines = fs.readFileSync(envExamplePath, 'utf-8').split('\n');
    envExampleSafe = true;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        if (
          (key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN') || key.includes('HEADERS')) &&
          val.length > 0
        ) {
          envExampleSafe = false;
        }
      }
    }
  }

  // 3. Сканування файлів коду (без тестів, що тестують детекцію секретів, як memory.test.ts)
  const filesToScan = [
    ...collectSourceFiles(path.join(rootDir, 'src')),
    ...collectSourceFiles(path.join(rootDir, 'app')),
  ];

  const findings: SecretFinding[] = [];
  for (const filePath of filesToScan) {
    // Виняток для схеми пам'яті, де описані патерни RegExp
    if (filePath.endsWith(path.join('memory', 'schema.ts')) || filePath.endsWith('secrets-audit.ts')) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((lineText, idx) => {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(lineText)) {
          findings.push({
            file: path.relative(rootDir, filePath),
            line: idx + 1,
            rule: pattern.name,
          });
        }
      }
    });
  }

  const passed = gitignoreProtected && envExampleSafe && findings.length === 0;

  return {
    gitignoreProtected,
    envExampleSafe,
    scannedFilesCount: filesToScan.length,
    findings,
    passed,
  };
}
