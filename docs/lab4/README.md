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
