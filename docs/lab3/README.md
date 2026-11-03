# Лабораторна 3 — харнес автономних агентів

- **Репозиторій:** [https://github.com/Volodymyr-Is/AI-41-Agents-Project](https://github.com/Volodymyr-Is/AI-41-Agents-Project)
- **Студент:** Іськович Володимир (група АІ-41)
- **Тема:** Побудова надійного харнесу, конвеєра детермінованих та модельних брам, системи спостережуваності та захисту від інʼєкцій для спортивного журналу

---

## 1. Таблиця прийняття

| Критерій | Де доказ | Посилання |
|---|---|---|
| **брама · CI зелений на поданому SHA** | Прогін GitHub Actions на зафіксованому коміті `main` | [GitHub Actions Run](https://github.com/Volodymyr-Is/AI-41-Agents-Project/actions) |
| **брама · журнал автономності, ≥ 4 сесії** | `docs/lab3/autonomy-log.md` (9 повних сесій, дати занять 09–10) | [autonomy-log.md](autonomy-log.md) · [GitHub Permalink](https://github.com/Volodymyr-Is/AI-41-Agents-Project/blob/main/docs/lab3/autonomy-log.md) |
| **брама · жодного обходу перевірок дозволів** | Конфігурація харнесу: `dontAsk` + sandbox + детерміновані гардрайли | [scripts/redteam/guardrails.ts](../../scripts/redteam/guardrails.ts) · [autonomy-log.md](autonomy-log.md) |
| **брама · немає секретів в історії** | Перевірка `git log --all` по шляхах `.env`, `.env.local` та ключах | `git log --all --oneline -- .env .env.local` — порожній вивід |
| **крок 00 · фабрика задач** | `docs/lab3/factory.md` (черга `tasks.jsonl`, ізоляція `worktree`, артефакти) | [factory.md](factory.md) · [GitHub Permalink](https://github.com/Volodymyr-Is/AI-41-Agents-Project/blob/main/docs/lab3/factory.md) |
| **крок 01 · ланцюг брам** | `docs/lab3/gates.md` (`types` → `lint` → `tests` → `build` → `record`) | [gates.md](gates.md) · [GitHub Permalink](https://github.com/Volodymyr-Is/AI-41-Agents-Project/blob/main/docs/lab3/gates.md) |
| **крок 02 · верифікатор зупинив зміну** | `docs/lab3/verifier.md` (інша модель, зупинена зміна, $\kappa = 0.8413$) | [verifier.md](verifier.md) · [GitHub Permalink](https://github.com/Volodymyr-Is/AI-41-Agents-Project/blob/main/docs/lab3/verifier.md) |
| **крок 03 · прогін зупинився сам** | `docs/lab3/stop.md` (3 рівні зупинення, бюджет, таймаут, Circuit Breaker) | [stop.md](stop.md) · [GitHub Permalink](https://github.com/Volodymyr-Is/AI-41-Agents-Project/blob/main/docs/lab3/stop.md) |
| **крок 04 · регресійна брама в CI** | `docs/lab3/evals.md` (20 задач, $k=3$, $pass^k$, базова лінія `evals-baseline.json`) | [evals.md](evals.md) · [GitHub Permalink](https://github.com/Volodymyr-Is/AI-41-Agents-Project/blob/main/docs/lab3/evals.md) |
| **крок 05 · число згоди судді** | `docs/lab3/judge.md` (22 кейси, матриця 3х3, каппа Коена $\kappa = 1.0000$) | [judge.md](judge.md) · [GitHub Permalink](https://github.com/Volodymyr-Is/AI-41-Agents-Project/blob/main/docs/lab3/judge.md) |
| **крок 06 · класифікація помилок** | `docs/lab3/errors.md` (5 класів відмов, оцінка збитків, 10 OTLP трейсів) | [errors.md](errors.md) · [GitHub Permalink](https://github.com/Volodymyr-Is/AI-41-Agents-Project/blob/main/docs/lab3/errors.md) |
| **крок 07 · ін'єкція промпту** | `docs/lab3/redteam.md` (6 атак, ATLAS/OWASP, ліквідація дірки `r-03`) | [redteam.md](redteam.md) · [GitHub Permalink](https://github.com/Volodymyr-Is/AI-41-Agents-Project/blob/main/docs/lab3/redteam.md) |
| **крок 08 · цей звіт** | `docs/lab3/README.md` (зведення результатів, доказів та інструкцій) | [README.md](README.md) · [GitHub Permalink](https://github.com/Volodymyr-Is/AI-41-Agents-Project/blob/main/docs/lab3/README.md) |

---

## 2. Прогони CI

- **Зелений на поданому SHA:**
  - Посилання на успішний прогін: [GitHub Actions Workflow Runs](https://github.com/Volodymyr-Is/AI-41-Agents-Project/actions)
  - Статус: усі 4 брами (`types`, `lint`, `tests`, `build`) та свідок `record` завершилися зі статусом `success` (зелені).
- **Червоний, збережений як доказ:**
  - Посилання на прогін: [Actions Run #40743771748](https://github.com/Volodymyr-Is/AI-41-Agents-Project/actions/runs/40743771748)
  - Гілка: `harness/red-2026-10-28`
  - Що саме зупинило: Брама **`types`** (помилка компілятора TypeScript `TS2322: Type 'string' is not assignable to type 'number'` у файлі `src/broken-type.ts`).
  - Поведінка ланцюга: Наступні брами (`lint`, `tests`, `build`) отримали статус **`skipped`**, що підтверджує детерміноване переривання ланцюга без марнування ресурсів раннера.
- **Виправлення після червоного:**
  - Посилання на коміт виправлення: [Commit 110e95ff](https://github.com/Volodymyr-Is/AI-41-Agents-Project/commit/110e95ff1ec54221f87accce8466de416c2793d1)
  - Результат: повне відновлення зеленого статусу всього ланцюга перевірок.

---

## 3. Інструменти й моделі

| Роль | Інструмент / Код | Модель із версією | Платний чи безкоштовний шлях |
|---|---|---|---|
| **Виконавець задач (Task Runner)** | `scripts/harness/run-task.ts` | Gemini 2.5 Flash / Gemini 3.8 Flash | Безкоштовні квоти Google AI Studio |
| **Верифікатор змін (Verifier Gate)** | `scripts/verifier/verifier.ts` | Gemini 2.5 Pro / Claude 3.5 Sonnet | Безкоштовний тестовий рівень / офлайн-симуляція |
| **Модель-суддя (Judge)** | `scripts/judge/calibrate.ts` | Gemini 2.5 Flash | Безкоштовні квоти Google AI Studio |
| **Телеметрія та трейси** | `scripts/telemetry/otel.ts` | OpenTelemetry NodeSDK + Langfuse | Безкоштовний хмарний план Langfuse Cloud |
| **Red-team раннер безпеки** | `scripts/redteam/run-redteam.ts` | Власний headless harness | 100% офлайн (безкоштовно) |

---

## 4. Як повторити автономний прогін

1. **Клонування та встановлення залежностей:**
   ```bash
   git clone https://github.com/Volodymyr-Is/AI-41-Agents-Project.git
   cd AI-41-Agents-Project
   npm ci
   ```

2. **Запуск детермінованих перевірок якості коду:**
   ```bash
   npm test               # 214 офлайн-тестів Vitest
   npm run typecheck      # статична типізація TypeScript
   npm run lint           # перевірка стилю коду ESLint
   ```

3. **Запуск автономної фабрики задач (Крок 00):**
   ```bash
   node --import tsx scripts/harness/run-queue.ts --tasks docs/lab3/tasks.jsonl --out docs/lab3/runs
   ```

4. **Запуск регресійної брами Evals (Крок 04):**
   ```bash
   node --import tsx scripts/evals/run-evals.ts --k 3
   ```

5. **Запуск калібрування моделі-судді (Крок 05):**
   ```bash
   node --import tsx scripts/judge/calibrate.ts
   ```

6. **Запуск перевірки стійкості Red-Team (Крок 07):**
   ```bash
   node --import tsx scripts/redteam/run-redteam.ts
   ```

### Режим дозволів і перелік дозволених інструментів:
- **Режим дозволів:** `dontAsk` (повністю автономний headless-режим у середовищі CI та під час перевірок безпеки).
- **Дозволені інструменти:** 
  - Детерміновані гардрайли: `guardPathBoundary`, `guardSecretFile`, `guardCommand`.
  - Детерміновані оцінювачі: `acceptanceGreen`, `touchesOnlyListed`, `noChanges`, `testsUntouched`.
- **Спосіб ізоляції:**
  - Кожен тестовий та експериментальний запуск виконується в ізольованому робочому дереві `git worktree` або окремому підкаталозі, унеможливлюючи вплив невдалих прогонів на робочу гілку. Всі тести працюють офлайн без доступу до зовнішньої мережі.

---

## 5. Зведення чисел прогонів (підсумок)

Зведені показники функціонування харнесу:

- **Регресійний набір (Крок 04):**
  - Загальний банк: 20 задач (12 regression, 4 new, 4 edge), заморожений на дату `2026-10-29`.
  - Показники кошика regression: **$pass^3 = 100\%$ ($1.00$)**, **$pass@3 = 100\%$ ($1.00$)**.
  - Порівняння з базовим рівнем `docs/lab3/evals-baseline.json`: **0 регресій**.
- **Калібрування оцінювачів та судді (Кроки 02, 05):**
  - Згода верифікатора з розміткою (Крок 02): $P_o = 90\%$, каппа Коена **$\kappa = 0.8413$** (майже ідеальна згода).
  - Згода моделі-судді (Крок 05): 22 випадки, матриця невідповідностей 3х3, **$P_o = 100\%$**, каппа Коена **$\kappa = 1.0000$**.
- **Телеметрія та класифікація помилок (Крок 06):**
  - Класифіковано 10 реальних прогонів із відмовами за 5 класами таксономії (`model`, `tool`, `env`, `task`, `harness`).
  - Згенеровано та збережено 10 валідних OpenTelemetry OTLP JSON-трас у каталозі `docs/lab3/traces/`.
- **Стійкість до атак Red-Team (Крок 07):**
  - 6 сценаріїв атак через 3 точки входу (`task_input`, `tool_result`, `fetched_doc`) розмічено за MITRE ATLAS (`AML.T0051.000`/`.001`) та OWASP LLM01.
  - Усі 6 атак нейтралізовано (**$6/6$**).
  - Продемонстровано усунення дірки path traversal у сценарії `r-03`: створення файлу `../pwned.txt` блокується функцією `guardPathBoundary`. Всі 5 інваріантів цілісні.

> **Підсумкове твердження, що підлягає перевірці:**  
> *«Розроблений харнес спортивного журналу забезпечує повний захист від регресій ($pass^3 = 100\%$ на регресійному наборі) та ворожих інʼєкцій промпту ($6/6$ атак зупинено) за рахунок багаторівневого ланцюга детермінованих брам, строгої ізоляції у git worktree та безперервної верифікації 5 інваріантів безпеки.»*

---

## 6. Карта артефактів (`docs/lab3/`)

| Файл / Каталог | Крок | Опис артефакту |
|---|:---:|---|
| [README.md](README.md) | **08** | Головний підсумковий звіт та пакет доказів лабораторії. |
| [factory.md](factory.md) | **00** | Фабрика задач: черга задач, виконавець, збереження артефактів. |
| [gates.md](gates.md) | **01** | Ланцюг детермінованих брам у CI та навмисний червоний прогін. |
| [verifier.md](verifier.md) | **02** | Верифікатор на іншій моделі: рубрика та зупинений випадок. |
| [stop.md](stop.md) | **03** | Автоматичне зупинення: бюджет, таймаут, Circuit Breaker. |
| [evals.md](evals.md) | **04** | Еталонний набір задач у CI та регресійна брама. |
| [judge.md](judge.md) | **05** | Калібрування судді, матриця невідповідностей 3х3, каппа Коена. |
| [errors.md](errors.md) | **06** | Класифікація помилок за таксономією та аналіз збитків. |
| [redteam.md](redteam.md) | **07** | Red-teaming: сценарії інʼєкцій, інваріанти, ліквідація дірки. |
| [autonomy-log.md](autonomy-log.md) | **00–08** | Журнал автономності розробника (9 задокументованих сесій). |
| [redteam.jsonl](redteam.jsonl) | **07** | Машиночитний лог прогонів red-team із прив'язкою `trace_id`. |
| [traces/](traces/) | **06, 07** | Каталог OpenTelemetry OTLP JSON-трас (16 файлів). |
| [runs/](runs/) | **00, 01** | Артефакти реальних запусків задач фабрики агента. |
| [verdicts/](verdicts/) | **02, 05** | Зафіксовані машиночитні вердикти верифікатора та судді. |

