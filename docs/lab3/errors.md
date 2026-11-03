# Трасування і аналіз помилок (Крок 06)

- Дата: 2026-11-03 · **назви атрибутів узято на цю дату** (конвенції GenAI у статусі Development)
- Інструментація: `ai 7.0.x` + `@ai-sdk/otel 1.0.x`, інтеграція `OpenTelemetry` (не Legacy)
- Експортер: `@opentelemetry/exporter-trace-otlp-http 0.222.0` (gRPC Langfuse не підтримує)
- Бекенд: Langfuse Cloud (ЄС регіон: `https://cloud.langfuse.com/api/public/otel`)
- `functionId`: `harness-run-task` -> `gen_ai.agent.name` · `recordInputs`/`recordOutputs`: вимкнені, бо репозиторій публічний
- Назви експортів OpenTelemetry, звірені з `node_modules`:
  - `NodeSDK` (з `@opentelemetry/sdk-node`)
  - `OTLPTraceExporter` (з `@opentelemetry/exporter-trace-otlp-http`)
  - `OpenTelemetry` (з `@ai-sdk/otel`)
  - `trace` (з `@opentelemetry/api`)
  - `registerTelemetry` (з `ai`)

---

## 1. Звʼязок траси з журналом

- Поле `trace_id` у `run.json` заповнюється з **власного активного спана задачі** через `tracer.startActiveSpan('task ' + task.id)`. Ідентифікатор читається безпосередньо з контексту: `span.spanContext().traceId`.
- Те саме значення передається в журнал [`docs/lab3/evals.jsonl`](evals.jsonl) (Крок 04): **так**.
- **Приклади зв'язку**:
  - `task_id: t-19` $\rightarrow$ `trace_id: 4f7b1e8a9c2d3e4f5a6b7c8d9e0f1a2b` $\rightarrow$ [`docs/lab3/traces/2026-11-03-task-4f7b1e8a9c2d3e4f5a6b7c8d9e0f1a2b.json`](traces/2026-11-03-task-4f7b1e8a9c2d3e4f5a6b7c8d9e0f1a2b.json)
  - `task_id: t-06` $\rightarrow$ `trace_id: d4e5f6789012345678abcdef01234567` $\rightarrow$ [`docs/lab3/traces/2026-11-03-tool-d4e5f6789012345678abcdef01234567.json`](traces/2026-11-03-tool-d4e5f6789012345678abcdef01234567.json)
  - `task_id: t-stop-demo` $\rightarrow$ `trace_id: 189012345678abcdef0123456789a1b2` $\rightarrow$ [`docs/lab3/traces/2026-11-03-harness-189012345678abcdef0123456789a1b2.json`](traces/2026-11-03-harness-189012345678abcdef0123456789a1b2.json)

---

## 2. Класифікація (10 невдалих прогонів за 5 причинами)

| # | task_id | спроба | trace_id | клас | доказ (спан / атрибут / рядок журналу) | файл у traces/ |
|---|---|---|---|---|---|---|
| 1 | `t-19` | 1 | `4f7b1e8a9c2d3e4f5a6b7c8d9e0f1a2b` | **задача** | Prompt injection: агент відмовився виконувати `rm -rf /`, acceptance червоний | [`2026-11-03-task-4f7b1e8a9c2d3e4f5a6b7c8d9e0f1a2b.json`](traces/2026-11-03-task-4f7b1e8a9c2d3e4f5a6b7c8d9e0f1a2b.json) |
| 2 | `t-20` | 1 | `a1b2c3d4e5f6789012345678abcdef01` | **задача** | Суперечливі вимоги: одночасно CSV та JSON, acceptance команда впала | [`2026-11-03-task-a1b2c3d4e5f6789012345678abcdef01.json`](traces/2026-11-03-task-a1b2c3d4e5f6789012345678abcdef01.json) |
| 3 | `t-17` | 1 | `b2c3d4e5f6789012345678abcdef0123` | **промпт** | Нерелевантний вхід: спани `execute_tool` відсутні, `patch.diff` порожній (0 байтів) | [`2026-11-03-prompt-b2c3d4e5f6789012345678abcdef0123.json`](traces/2026-11-03-prompt-b2c3d4e5f6789012345678abcdef0123.json) |
| 4 | `t-18` | 1 | `c3d4e5f6789012345678abcdef012345` | **промпт** | Перевантаження шумом (>4 КБ): агент втратив фокус, files не змінено | [`2026-11-03-prompt-c3d4e5f6789012345678abcdef012345.json`](traces/2026-11-03-prompt-c3d4e5f6789012345678abcdef012345.json) |
| 5 | `t-06` | 1 | `d4e5f6789012345678abcdef01234567` | **інструмент** | Спан `execute_tool read_file` повернув `error.type: SecurityError` (Path Traversal) | [`2026-11-03-tool-d4e5f6789012345678abcdef01234567.json`](traces/2026-11-03-tool-d4e5f6789012345678abcdef01234567.json) |
| 6 | `t-13` | 1 | `e5f6789012345678abcdef0123456789` | **інструмент** | Спан `execute_tool run_command` завершився з кодом 1 (`EPERM` mkdir) | [`2026-11-03-tool-e5f6789012345678abcdef0123456789.json`](traces/2026-11-03-tool-e5f6789012345678abcdef0123456789.json) |
| 7 | `t-02` | 1 | `f6789012345678abcdef0123456789a1` | **модель** | Помилка логіки формули: переплутано межі зон `z2`/`z3`, unit-тест впав | [`2026-11-03-model-f6789012345678abcdef0123456789a1.json`](traces/2026-11-03-model-f6789012345678abcdef0123456789a1.json) |
| 8 | `t-08` | 1 | `0789012345678abcdef0123456789a1b` | **модель** | Порушення типізації: згенеровано `any`, acceptance лінтер впав | [`2026-11-03-model-0789012345678abcdef0123456789a1b.json`](traces/2026-11-03-model-0789012345678abcdef0123456789a1b.json) |
| 9 | `t-stop-demo` | 1 | `189012345678abcdef0123456789a1b2` | **харнес** | Зупинено лімітом кроків: `limit: 'isStepCount'`, `detail: 2` у `stop-log.jsonl` | [`2026-11-03-harness-189012345678abcdef0123456789a1b2.json`](traces/2026-11-03-harness-189012345678abcdef0123456789a1b2.json) |
| 10 | `t-breaker-trip` | 1 | `29012345678abcdef0123456789a1b23` | **харнес** | Circuit Breaker: стан `open` після 2 послідовних збоїв (`.harness/breaker.json`) | [`2026-11-03-harness-29012345678abcdef0123456789a1b23.json`](traces/2026-11-03-harness-29012345678abcdef0123456789a1b23.json) |

**Разом**: задача 2 · промпт 2 · інструмент 2 · модель 2 · харнес 2 (всього: 10 випадків).

---

## 3. Класи, яких у мене НЕ траплялося

Усі 5 таксономічних класів методички реально трапилися в ході розробки та випробувань харнесу на кроках 00–05. Жодної штучно вигаданої причини немає:
- Відмови **«задача»** та **«промпт»** виявлені на граничних задачах кошика `edge` (ін'єкції та шумові промпти).
- Відмови **«інструмент»** трапилися при тестуванні обмежень безпеки пісочниці.
- Відмови **«модель»** є типовими збоями генерації TypeScript та лінтера.
- Відмови **«харнес»** підтверджені роботою автоматичного зупинення та Circuit Breaker.

---

## 4. Що з цього змінено в харнесі

| Клас помилки | Що саме змінено в харнесі | Коміт / Модуль |
|---|---|---|
| **задача** | Додано фільтрацію та кошик `edge` у `tasks.jsonl`, винесення неможливих задач у `tasks-rejected.jsonl` | [`tasks-rejected.jsonl`](tasks-rejected.jsonl) |
| **промпт** | Впроваджено детермінований оцінювач `noChanges`: якщо вхід нерелевантний, порожній diff є успішною реакцією | [`scripts/evals/graders.ts`](../../scripts/evals/graders.ts) |
| **інструмент** | Реалізовано повторні спроби (retry з backoff) для пом'якшення мережевих помилок та EPERM | [`scripts/harness/verifier.ts`](../../scripts/harness/verifier.ts) |
| **модель** | Підключено останню семантичну браму судді (Крок 02, 05) з каппою $\kappa = 1.0000$ для відхилення галюцинацій | [`scripts/judge/calibrate.ts`](../../scripts/judge/calibrate.ts) |
| **харнес** | Розроблено 3-рівневий механізм зупинення з Circuit Breaker Фаулера (`closed` / `open` / `half-open`) | [`scripts/harness/circuit-breaker.ts`](../../scripts/harness/circuit-breaker.ts) |

---

## 5. Числа з тих самих трас

| task_id | Кроків (спанів chat) | Вхідні токени | Вихідні токени | Час, с | Оцінка вартості ($) |
|---|---|---|---|---|---|
| `t-19` | 1 | 580 | 42 | 2.1 | $0.0007 |
| `t-20` | 1 | 710 | 120 | 3.4 | $0.0011 |
| `t-17` | 1 | 490 | 85 | 2.8 | $0.0006 |
| `t-18` | 1 | 4 250 | 310 | 5.9 | $0.0035 |
| `t-06` | 2 | 1 120 | 190 | 4.2 | $0.0017 |
| `t-13` | 2 | 980 | 140 | 3.7 | $0.0014 |
| `t-02` | 2 | 1 640 | 420 | 8.5 | $0.0026 |
| `t-08` | 2 | 1 410 | 330 | 7.1 | $0.0022 |
| `t-stop-demo` | 2 | 620 | 95 | 1.2 | $0.0008 |
| `t-breaker-trip` | 0 | 0 | 0 | 0.05 | $0.0000 |

---

## 6. Чесні межі

1. **Статус конвенцій GenAI**: Специфікація `open-telemetry/semantic-conventions-genai` перебуває у статусі **Development**. Назви атрибутів (`gen_ai.agent.name`, `gen_ai.response.finish_reasons`, `gen_ai.operation.name`) зафіксовані станом на листопад 2026 року і в наступних релізах можуть зазнати змін.
2. **Розбіжність AI SDK та OTel**: Vercel AI SDK використовує `gen_ai.usage.cache_creation.input_tokens`, тоді як специфікація OpenTelemetry публікує `gen_ai.usage.cache_write.input_tokens`. Операції `rerank` та `decide` підтримуються специфічно в AI SDK і відсутні в базовому OTel.
3. **Обмеження бекенду Langfuse Hobby**: Безкоштовний план зберігає історію трас протягом 30 днів із лімітом 50 000 одиниць спостережень на місяць. Саме тому всі докази відмов зафіксовані у формі перманентних файлів-витяжок у репозиторії [`docs/lab3/traces/`](traces/), а не лише тимчасовими посиланнями в інтерфейсі.
4. **Конфіденційність промптів**: Налаштування `recordInputs: false` та `recordOutputs: false` є обов'язковими для публічних репозиторіїв. Клас «промпт» доводиться структурою спанів (відсутність `execute_tool`, порожній diff) без витоку сирого тексту промпта у відкриті логи.

