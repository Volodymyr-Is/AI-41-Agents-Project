import { CircuitBreaker } from './circuit-breaker';
import { logStopEvent, stepLimit } from './agent-stop';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Демонстраційний скрипт навмисного автоматичного зупинення прогону (Крок 03).
 * Доводить, що:
 * 1. Спрацьовує ліміт кроків isStepCount(N) при перевищенні ліміту.
 * 2. Подія автоматично записується в docs/lab3/stop-log.jsonl.
 * 3. Circuit Breaker переходить у стан open після перевищення порогу відмов.
 */
export async function runStoppedTaskDemo(logFile = 'docs/lab3/stop-log.jsonl', breakerFile = '.harness/breaker.json') {
  console.log('=== Демонстрація автоматичного зупинення (Крок 03) ===');

  const taskId = 't-stop-demo';
  const breaker = new CircuitBreaker({ filePath: breakerFile, threshold: 2, cooldownMin: 15 });
  breaker.reset();

  console.log('[1/3] Перевірка стану circuit breaker перед запуском...');
  const check1 = breaker.mayRun();
  console.log(`   -> Стан: ${check1.state}, allow: ${check1.allow}, why: ${check1.why}`);

  console.log('\n[2/3] Моделювання агентного циклу із заниженим лімітом isStepCount(2)...');
  const limitHook = stepLimit(2, taskId, logFile);

  // Імітуємо кроки агентного циклу AI SDK ({ steps })
  const dummyStep = { toolCalls: [] } as any;
  const step1 = limitHook({ steps: [dummyStep] } as any);
  console.log(`   Крок 1: зупинка? ${Boolean(step1)}`);

  const step2 = limitHook({ steps: [dummyStep, dummyStep] } as any);
  console.log(`   Крок 2: зупинка? ${Boolean(step2)}`);

  // Даємо час на запис логу
  await new Promise((r) => setTimeout(r, 100));

  console.log('\n[3/3] Реєстрація невдалого прогону в Circuit Breaker...');
  // Фіксуємо першу невдачу
  breaker.recordResult({
    ok: false,
    tripReason: 'Зупинено за лімітом isStepCount(2): задача не завершила генерацію',
  });

  // Фіксуємо другу невдачу (поріг 2) -> брейкер має розімкнутися (OPEN)
  const afterSecondFail = breaker.recordResult({
    ok: false,
    tripReason: 'Повторна невдача: перевищення ліміту кроків',
  });

  console.log(`   -> Стан брейкера після 2 невдач: ${afterSecondFail.state}`);
  console.log(`   -> Причина trip: ${afterSecondFail.trip}`);

  const checkBlocked = breaker.mayRun();
  console.log(`   -> Спроба запустити наступну задачу: allow=${checkBlocked.allow}, why=${checkBlocked.why}`);

  if (existsSync(logFile)) {
    const logs = readFileSync(logFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    console.log(`\nВміст ${logFile} (останній запис):`);
    console.log(logs[logs.length - 1]);
  }

  return { check1, checkBlocked, breakerState: afterSecondFail.state };
}

if (process.argv[1]?.includes('run-stopped-task')) {
  runStoppedTaskDemo().catch(console.error);
}
