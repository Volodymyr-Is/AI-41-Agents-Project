# Звіт Кроку 06: Зміцнення деплою (телеметрія, ліміти витрат, секрети)

## 1. Чотири обмеження платформи (Vercel Hobby) та наслідки для коду

Константи платформи зафіксовані в [`src/hardening/config.ts`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/src/hardening/config.ts) (`PLATFORM_HOBBY_LIMITS`):

| Параметр платформи | Значення на Hobby | Наслідок для архітектури та коду |
| :--- | :---: | :--- |
| **Максимальна тривалість** | **300 с** (межа — `504 FUNCTION_INVOCATION_TIMEOUT`) | На рівні роута встановлено `maxDuration = 60`, а кожен агентний цикл обмежується `stopWhen` / таймаутами `AbortController`. |
| **Пам'ять та CPU** | **2 ГБ / 1 vCPU** | Заборонено тримати в пам'яті функції важкі моделі або роздуті буфери; індекси та файли читаються компактно. |
| **Тіло запиту / відповіді** | **4.5 МБ** (межа — `413 FUNCTION_PAYLOAD_TOO_LARGE`) | `ProductionHardeningGuard.checkBeforeRun` відхиляє запити > 4.5 MB ще до виклику моделі (`413`), а в мультимодальному клієнті діє поріг ~3.37 MB через +33% оверхед base64. |
| **Регіон та логи** | **1 регіон (`iad1`)**, логи **1 год**, Log Drains недоступні | Події неможливо розслідувати через вчорашні логи платформи — потрібен миттєвий зовнішній експорт спанів через `after(() => langfuseSpanProcessor.forceFlush())`. |

---

## 2. Телеметрія як частина застосунку та приватність

### 2.1 Протокол і транспорт (OTLP/HTTP)
- Langfuse приймає OTLP лише по HTTP (`gRPC` не підтримується).
- У [`scripts/telemetry/otel.ts`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/scripts/telemetry/otel.ts) та [`src/otel/langfuse.ts`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/src/otel/langfuse.ts) підключено `OTLPTraceExporter` / `LangfuseSpanProcessor` з режимом `exportMode: 'immediate'` і обов'язковим заголовком `x-langfuse-ingestion-version=4`.
- У серверних обробниках (`app/api/agent/route.ts`) перед викликом моделі реєструється `after(async () => await langfuseSpanProcessor.forceFlush())`, щоб гарантувати доставку спанів до завершення serverless-процесу.

### 2.2 Приватність траси (Free Tier Compliance)
Функція `createSafeTelemetryConfig(functionId)` жорстко фіксує:
- `recordInputs: false`
- `recordOutputs: false`
Таким чином вміст промптів, щоденників тренувань чи відповідей користувача **не потрапляє в траси**.

### 2.3 Двостороння прив'язка траси до задачі
- **Уперед**: `telemetry.functionId` передається у спан як атрибут `gen_ai.agent.name` — прогін легко знайти в Langfuse за назвою задачі.
- **Назад**: батьківський спан віддає `traceId`, який фіксується в полі `trace_id` журналу прогону (`TracedRunLog`), що доведено у [`docs/lab4/hardening-limit-proof.json`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/docs/lab4/hardening-limit-proof.json).

---

## 3. Ліміти витрат та аварійний вимикач (Kill Switch)

Оскільки на тарифі Hobby опція *Spend Management* має статус `N/A`, обмеження реалізовано на рівні застосунку в [`src/hardening/guard.ts`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/src/hardening/guard.ts) (`ProductionHardeningGuard`):

1. **Kill Switch не у змінній середовища**:
   - Зміна змінної середовища на платформі набуває чинності лише після нового деплою (деплої на Hobby обмежені 100/добу, а сам деплой може впасти під час інциденту).
   - Наш `KillSwitchStore` читається динамічно на кожен запит. Якщо сховище недоступне (`throwOnRead`) — спрацьовує **fail-closed** (`503 Service Unavailable`, `KILL_SWITCH_UNAVAILABLE`).
2. **Розділення сховищ лічильника та прапорця**:
   - Лічильник квоти не зберігається у локальній `Map` пам'яті інстанса (serverless автомасштабується до тисяч інстансів, і локальна пам'ять не ділить квоту).
   - Лічильник не зберігається у конфіг-сторі прапорця (який має ліміт 100 записів/місяць на Hobby). Інтерфейс `SpendQuotaStore` ізольовано для підключення спільного швидкого сховища (Redis/KV).
3. **Доказ спрацювання стелі витрат**:
   - У тесті `tests/hardening.test.ts` прогон перевищив денний ліміт 5000 токенів (5200/5000), після чого наступний запит було заблоковано зі статусом `429 Too Many Requests` (`SPEND_LIMIT_EXCEEDED`).
   - Зафіксований артефакт доказу збережено в [`docs/lab4/hardening-limit-proof.json`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/docs/lab4/hardening-limit-proof.json).

---

## 4. Аудит секретів та регламент компрометації

### 4.1 Результати автоматичного аудиту (`src/hardening/secrets-audit.ts`)
Функція `runSecretsAudit()` перевірила стан репозиторію (без читання `.env` чи `.env.local`):
- **`.gitignore` захист**: підтверджено виключення `.env` та `.env.local` (`gitignoreProtected: true`).
- **`.env.example` гігієна**: усі секретні ключі, токени та заголовки авторизації мають порожні значення (`envExampleSafe: true`).
- **Сканування коду (`src/`, `app/`)**: виявлено **0 витоків** API-ключів Google, OpenAI, Anthropic, GitHub, Langfuse або приватних ключів.

### 4.2 Незмінний порядок дій при витоку ключа в Git
Якщо секрет випадково потрапив у коміт, його заборонено спочатку "просто видаляти з історії", бо ключ лишається валідним для зловмисника. Правильний порядок:
1. **Відкликати** скомпрометований ключ у кабінеті провайдера (негайно).
2. **Видати новий** ключ.
3. **Перевірити**, що новий ключ коректно працює в захищеному середовищі.
4. **Лише потім очистити історію** Git (`git filter-repo` або `BFG`).
