# Пакет доказів та інструкція відтворюваності Лабораторної 4

## Таблиця прийняття

| Критерій | Крок / Брама | Доказ (посилання) | Стан |
| :--- | :---: | :--- | :---: |
| **Публічні репозиторії, збережено `lab1`–`lab3`, 0 секретів** | Брама | [`.env.example`](../../.env.example), [`secrets-audit.ts`](../../src/hardening/secrets-audit.ts) | ✅ |
| **Зелена брама локально і CI (типи, лінт, тести, збірка)** | Брама | [`.github/workflows/gates.yml`](../../.github/workflows/gates.yml) *(оновити посилання на Action після фінального push)* | ⏳ Очікує фінального push |
| **Форк `ms` публічний, ліцензія збережена, відновлено контекст** | Крок 00 | [`docs/lab4/context.md`](context.md), форк [`Volodymyr-Is/ms@4ff48ce`](https://github.com/Volodymyr-Is/ms/tree/4ff48cec099f0514c3e9bbca18706c9c21122bfb) | ✅ |
| **Характеризаційні тести на незміненому коді (`src/index.ts` не зачеплено)** | Крок 01 | [`docs/lab4/characterization.md`](characterization.md), [`characterization.test.ts@432ac18`](https://github.com/Volodymyr-Is/ms/blob/432ac18812a57ab63fff285d8f2a080e13548c7c/src/characterization.test.ts) | ✅ |
| **Ізольована зміна (`worktree`), окремий червоний тест, швидкий відкат** | Крок 02 | [`docs/lab4/change.md`](change.md), [`docs/lab4/rollback.md`](rollback.md), [`fix@3ce66f5`](https://github.com/Volodymyr-Is/ms/commit/3ce66f55d2c7f30ffbfdbb928bc3037d685e06e2), [`revert@2544faf`](https://github.com/Volodymyr-Is/ms/commit/2544fafe10ef4fadac65d82d33cc6622b9ef8dad) | ✅ |
| **Мультиагентна функціональність із 4-вимірним бюджетом та трасою зупинення** | Крок 03 | [`docs/lab4/multiagent.md`](multiagent.md), [`src/multiagent/`](../../src/multiagent), [`stopped-budget.json`](traces/stopped-budget.json) | ✅ |
| **Персистентна пам'ять харнеса + Deep Research на форку з верифікацією цитат** | Крок 04 | [`docs/lab4/memory.md`](memory.md), [`store.jsonl`](memory/store.jsonl), [`src/memory/`](../../src/memory) | ✅ |
| **Мультимодальний вхід (`FilePart`), Free Tier TTS, без генерації зображень, 10 кейсів** | Крок 05 | [`docs/lab4/multimodal.md`](multimodal.md), [`src/multimodal/`](../../src/multimodal), [`tests/multimodal.test.ts`](../../tests/multimodal.test.ts) | ✅ |
| **Зміцнення деплою: 4 числа Hobby, OTLP/HTTP, Kill Switch, Spend Limit, аудит секретів** | Крок 06 | [`docs/lab4/hardening.md`](hardening.md), [`hardening-limit-proof.json`](hardening-limit-proof.json), [`src/hardening/`](../../src/hardening) | ✅ |
| **Аудит вартості (`totalUsage`, «не повідомлено», A vs B, генерація звіту скриптом)** | Крок 07 | [`docs/lab4/cost.md`](cost.md), [`cost.ts`](../../scripts/harness/cost.ts), [`cost-report.ts`](../../scripts/harness/cost-report.ts), [`traces/`](traces) | ✅ |
| **Взаємна перевірка відтворюваності в парах** | Крок 08 | Інструкція нижче, шаблон [`docs/lab4/repro.md`](repro.md) | ⏳ Очікує Заняття 14 |
| **Пакет доказів, фінальний звіт і журнал автономності ($\ge 6$ сесій)** | Крок 09 | [`docs/lab4/report.md`](report.md), [`docs/lab4/autonomy-log.md`](autonomy-log.md) (9 сесій) | ✅ |

---

# Інструкція відтворюваності Лабораторної 4 (Крок 08)

Ця інструкція призначена для незалежного відтворення результатів у **новій порожній теці** (без попередніх `node_modules` чи власного `.env`).

---

## 0. Вимоги до середовища

- **Node.js**: `>= 22.12.0` (перевірено на `v24.11.0`)
- **TypeScript**: `6.0.3` (встановлюється локально з `package.json`)
- **pnpm** (для форку `ms`): `10.33.0` (через `npx pnpm@10.33.0`, бо `pnpm@9` не підтримує новий `pnpm-workspace.yaml`)
- **Git**: будь-яка актуальна версія

> [!CAUTION]
> **Безпека перед запуском чужого коду:**
> 1. Прочитайте `package.json` (`scripts`), файли правил (`AGENTS.md`) та конфігурації перед виконанням `install`.
> 2. Використовуйте **лише власний** ключ API або локальну модель Ollama. Ніколи не передавайте й не приймайте чужі ключі.

---

## 1. Курсовий репозиторій: прогін харнеса та перевірок

1. Клонуйте репозиторій у нову порожню теку й перейдіть на зафіксований SHA:
   ```powershell
   git clone https://github.com/Volodymyr-Is/AI-41-Agents-Project.git repro-course
   cd repro-course
   # Зафіксуйте точний SHA, переданий автором:
   git checkout <COURSE_SHA>
   ```

2. Встановіть залежності та підготуйте конфігурацію з шаблону:
   ```powershell
   npm install
   Copy-Item .env.example .env.local
   ```
   *(Усі тести проєкту працюють повністю автономно без мережі й платних API. Якщо ви запускаєте живого агента — додайте власний ключ у `.env.local` або вкажіть локальну модель Ollama).*

3. Запустіть повну перевірку «зеленої брами»:
   ```powershell
   npm test
   npm run typecheck
   npm run lint
   ```
   **Очікуваний результат:** усі 30 тест-файлів (260 тестів) проходять зелено, 0 помилок типізації та лінтера.

4. Запустіть прогін харнеса до появи артефакту й журналу:
   ```powershell
   npx tsx scripts/multiagent/benchmark.ts
   ```
   *(або прогін аудиту вартості)*:
   ```powershell
   npx vitest run tests/cost-audit.test.ts
   ```
   **Очікуваний результат (перший доказ):** у `docs/lab4/traces/` з'являються/оновлюються артефакти трас (`stopped-budget.json`, `cost-A-runs.jsonl`, `cost-B-runs.jsonl`), а в `docs/lab4/cost.md` — згенерований звіт.

---

## 2. Форк `ms`: характеризаційні тести (Крок 01)

1. Клонуйте форк у нову порожню теку:
   ```powershell
   cd ..
   git clone https://github.com/Volodymyr-Is/ms.git repro-ms
   cd repro-ms
   git checkout 432ac18812a57ab63fff285d8f2a080e13548c7c
   ```

2. Встановіть залежності через `pnpm@10.33.0`:
   ```powershell
   npx pnpm@10.33.0 install
   ```

3. Запустіть характеризаційні тести на незміненому коді (`src/index.ts` без правок):
   ```powershell
   npx pnpm@10.33.0 test
   ```
   **Очікуваний результат:** усі 174 тести (включно з 7 характеризаційними тестами у `src/characterization.test.ts`) проходять зелено.

---

## 3. Форк `ms`: відкат зміни за `rollback.md` (Крок 02)

1. Перейдіть на гілку зміни (`lab4/change`, SHA `3ce66f55d2c7f30ffbfdbb928bc3037d685e06e2`):
   ```powershell
   git checkout 3ce66f55d2c7f30ffbfdbb928bc3037d685e06e2
   npx pnpm@10.33.0 test
   ```
   **Очікуваний результат:** усі 175 тестів проходять зелено (включно з `src/boundary-fix.test.ts`).

2. Виконайте швидкий відкат виправлення (`git revert`):
   ```powershell
   git checkout -b local-rollback-test
   git revert --no-edit 3ce66f55d2c7f30ffbfdbb928bc3037d685e06e2
   npx pnpm@10.33.0 test
   ```
   *(або перевірте зафіксовану гілку `lab4/rollback-drill` за SHA `2544fafe10ef4fadac65d82d33cc6622b9ef8dad`)*

   **Очікуваний результат:** характеризаційні тести залишаються зеленими, а `src/boundary-fix.test.ts` знову падає з помилкою `Received function did not throw` (червоний стан відновлено без ручного редагування).
