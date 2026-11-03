/**
 * Експорт трас у Langfuse через OTLP/HTTP (Крок 06).
 *
 * Назви й версії ПАКЕТІВ — з перевірених джерел курсу:
 * - ai: 7.0.x
 * - @ai-sdk/otel: 1.0.x
 * - @opentelemetry/sdk-node: 0.222.0
 * - @opentelemetry/exporter-trace-otlp-http: 0.222.0
 *
 * Експортовані символи:
 * - registerTelemetry (з ai)
 * - OpenTelemetry (з @ai-sdk/otel)
 * - NodeSDK (з @opentelemetry/sdk-node)
 * - OTLPTraceExporter (з @opentelemetry/exporter-trace-otlp-http)
 * - trace (з @opentelemetry/api)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { trace, type Tracer, type Span } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { runTask, type Task, type RunRecord } from '../harness/run-task';

let isTelemetryInitialized = false;
let globalSdk: NodeSDK | null = null;

export interface TelemetryConfig {
  endpoint?: string;
  headers?: Record<string, string>;
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
}

/**
 * Ініціалізація OpenTelemetry SDK для надсилання спанів у Langfuse
 */
export function initTelemetry(config: TelemetryConfig = {}): { sdk: NodeSDK; tracer: Tracer } {
  if (isTelemetryInitialized && globalSdk) {
    return { sdk: globalSdk, tracer: trace.getTracer('harness') };
  }

  const endpoint =
    config.endpoint ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    (process.env.LANGFUSE_BASE_URL
      ? `${process.env.LANGFUSE_BASE_URL.replace(/\/$/, '')}/api/public/otel`
      : 'https://cloud.langfuse.com/api/public/otel');

  const headers: Record<string, string> = { ...config.headers };

  // Автоматично формуємо Basic Authorization для Langfuse (base64 від pk:sk)
  const pk = config.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY;
  const sk = config.secretKey ?? process.env.LANGFUSE_SECRET_KEY;

  if (pk && sk && !headers['Authorization'] && !process.env.OTEL_EXPORTER_OTLP_HEADERS) {
    const auth = Buffer.from(`${pk}:${sk}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
    headers['x-langfuse-ingestion-version'] = '4';
  }

  // Якщо headers передано у форматі "k1=v1,k2=v2" через env
  if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
    for (const part of process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',')) {
      const [k, ...v] = part.split('=');
      if (k && v.length > 0) {
        headers[k.trim()] = v.join('=').trim();
      }
    }
  }

  const traceExporter = new OTLPTraceExporter({
    url: endpoint.endsWith('/v1/traces') ? endpoint : `${endpoint.replace(/\/$/, '')}/v1/traces`,
    headers,
  });

  const sdk = new NodeSDK({
    traceExporter,
  });

  try {
    sdk.start();
    // Реєструємо інтеграцію AI SDK за конвенціями GenAI (gen_ai.*)
    registerTelemetry(new OpenTelemetry());
    isTelemetryInitialized = true;
    globalSdk = sdk;
  } catch {
    // Ігноруємо помилки повторного старту в тестах
  }

  const tracer = trace.getTracer('harness');
  return { sdk, tracer };
}

/**
 * Виконуємо задачу всередині власного спана, щоб журнал знав ідентифікатор траси (Крок 06)
 */
export function runTaskTraced(task: Task, opts: Parameters<typeof runTask>[1]): RunRecord {
  initTelemetry();
  const tracer = trace.getTracer('harness');

  return tracer.startActiveSpan(`task ${task.id}`, (span: Span) => {
    try {
      span.setAttribute('gen_ai.agent.name', 'harness-run-task');
      span.setAttribute('gen_ai.task.id', task.id);

      const rec = runTask(task, opts);
      const traceId = span.spanContext().traceId;

      // той самий ідентифікатор ляже і в run.json, і в evals.jsonl кроку 04
      const withTrace: RunRecord = {
        ...rec,
        trace_id: traceId,
      };

      // runTask уже записав run.json із trace_id: null (крок 00), тому журнал
      // перезаписуємо: інакше у файлі лишиться null, а значення буде лише в памʼяті
      writeFileSync(
        join(withTrace.artifact_dir, 'run.json'),
        `${JSON.stringify(withTrace, null, 2)}\n`,
        'utf8'
      );

      span.setAttribute('gen_ai.response.finish_reasons', [rec.exit_status]);
      span.setAttribute('gen_ai.task.acceptance_passed', rec.acceptance_passed);

      return withTrace;
    } finally {
      span.end();
    }
  });
}

/**
 * Класифікація відмов агента (5 таксономічних класів методички)
 */
export type ErrorClass = 'task' | 'prompt' | 'tool' | 'model' | 'harness';

export interface FailureAnalysisInput {
  task_id: string;
  exit_status: string;
  acceptance_passed: boolean;
  duration_s: number;
  patchLength?: number;
  toolErrors?: number;
  isBreakerOpen?: boolean;
  timedOut?: boolean;
  stepCount?: number;
  errorMessage?: string;
}

export function classifyFailure(input: FailureAnalysisInput): {
  errorClass: ErrorClass;
  reason: string;
  evidence: string;
} {
  // 1. Харнес: зупинено зовнішнім лімітом, таймером або circuit breaker
  if (input.timedOut || input.exit_status === 'timeout') {
    return {
      errorClass: 'harness',
      reason: 'Перевищено встановлений ліміт часу задачі (timeout watchdog)',
      evidence: `exit_status === 'timeout', duration_s: ${input.duration_s}`,
    };
  }

  if (input.isBreakerOpen) {
    return {
      errorClass: 'harness',
      reason: 'Circuit breaker заблокував запуск через поріг послідовних збоїв',
      evidence: 'circuit_breaker state === open',
    };
  }

  if (input.stepCount && input.stepCount <= 2 && !input.acceptance_passed) {
    return {
      errorClass: 'harness',
      reason: 'Автоматичне зупинення за лімітом агентних кроків (isStepCount limit)',
      evidence: `stepCount (${input.stepCount}) reached limit before acceptance green`,
    };
  }

  // 2. Задача: зламана специфікація, неіснуючий вхід, шкідливий вхід
  if (input.task_id.startsWith('t-rejected') || input.task_id === 't-19') {
    return {
      errorClass: 'task',
      reason: 'Некоректна специфікація задачі або шкідливий вхід (prompt injection / destructive)',
      evidence: `task_id === '${input.task_id}', acceptance criteria invalid or harmful`,
    };
  }

  // 3. Інструмент: збій виконання зовнішньої команди або тула
  if (input.toolErrors && input.toolErrors > 0) {
    return {
      errorClass: 'tool',
      reason: 'Помилка виконання виклику інструменту (exit code != 0 або sandbox reject)',
      evidence: `toolErrors count: ${input.toolErrors}, ${input.errorMessage ?? 'tool call failed'}`,
    };
  }

  // 4. Промпт: недостатній контекст, агент не зробив змін (diff порожній)
  if (input.patchLength === 0) {
    return {
      errorClass: 'prompt',
      reason: 'Промпт не надав достатнього контексту, агент повернув порожній результат',
      evidence: 'patch.diff is empty (0 bytes), no actions taken by agent',
    };
  }

  // 5. Модель: помилка логіки, синтаксису або генерації
  return {
    errorClass: 'model',
    reason: 'Модель згенерувала синтаксичну помилку або дефект бізнес-логіки',
    evidence: `acceptance tests failed (${input.errorMessage ?? 'acceptance exit !== 0'})`,
  };
}

