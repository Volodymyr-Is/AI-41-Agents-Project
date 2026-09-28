# Пакет доказів · Лабораторна 1

**Тема:** Спортивний журнал з можливістю зберігати пророблену роботу та аналізувати і покращувати її за допомогою ШІ для спортсменів та любителів спорту.  
**Виконав:** Володимир Ісаєнко, група АІ-41  
**Репозиторій:** [AI-41-Agents-Project](https://github.com/Volodymyr-Is/AI-41-Agents-Project)

---

## Інструменти

| Роль | Інструмент | Версія (`<інструмент> --version`) | План або модель |
|---|---|---|---|
| Агент кодування A | Codex CLI / Copilot CLI | `0.1.0` | GPT-5.6-terra |
| Агент кодування B | Antigravity IDE / CLI | `1.15.0` (`agy`) | Gemini 3.8 Flash |

---

## Як запустити у двох інструментах

### Інструмент A (Codex CLI / Copilot CLI)
1. Склонуйте репозиторій: `git clone https://github.com/Volodymyr-Is/AI-41-Agents-Project.git && cd AI-41-Agents-Project`
2. Скопіюйте шаблон оточення: `cp .env.example .env.local` та додайте відповідні API ключі.
3. Синхронізуйте навички: `npm run sync-skills`
4. Запустіть агента у терміналі: `codex` або `gh copilot`

### Інструмент B (Antigravity IDE / CLI)
1. Відкрийте папку репозиторію в **Antigravity IDE** або виконайте команду `agy` у корені проєкту.
2. Скопіюйте шаблон оточення: `cp .env.example .env.local` та вкажіть `GEMINI_API_KEY`.
3. Перевірте статус налаштування середовища: `npm run doctor`
4. Запустіть тести: `npm test`

---

## Прогони CI

- **Зелений прогін на main (Job verify):** [GitHub Actions Workflow Run](https://github.com/Volodymyr-Is/AI-41-Agents-Project/actions) (всі перевірки `typecheck`, `lint`, `test`, `build` успішні).
- **Зелений job «Playwright (не блокує)»:** [GitHub Actions Playwright](https://github.com/Volodymyr-Is/AI-41-Agents-Project/actions) · копія скріншота: [docs/lab1/e2e-home.png](e2e-home.png).
- **Червоний прогін «поганого патча»:** Очікується пул-реквест від викладача. (Локально перевірено: будь-яка невідповідність типів чи контракту тестів блокує job `verify`).

---

## Та сама задача в двох інструментах

- `lab1/health-codex`: [Гілка lab1/health-codex](https://github.com/Volodymyr-Is/AI-41-Agents-Project/tree/lab1/health-codex)
- `lab1/health-antigravity`: [Гілка lab1/health-antigravity](https://github.com/Volodymyr-Is/AI-41-Agents-Project/tree/lab1/health-antigravity)
- **У main злито:** `lab1/health-antigravity`, коміт `dc4729f`.

---

## Деплой і траси

- **Ендпоінт:** `https://ai-41-agents-project.vercel.app/api/agent` · рантайм: Vercel Serverless (Node.js App Router).
- **Система трасування:** Langfuse Cloud (OpenTelemetry auto-instrumentation).
- **Скріншоти трас:** [docs/lab1/traces/](traces/)
  - [Траса 1 (trace-1.png)](traces/trace-1.png)
  - [Траса 2 (trace-2.png)](traces/trace-2.png)
  - [Траса 3 (trace-3.png)](traces/trace-3.png)

---

## Докази за критеріями

| Критерій | Файл або посилання |
|---|---|
| AGENTS.md ≤ 200 рядків, тест 40% | [AGENTS.md](../../AGENTS.md) · [agents-md-40.md](agents-md-40.md) |
| Журнал із двох інструментів | [.agent-log/antigravity.jsonl](../../.agent-log/antigravity.jsonl) · [.agent-log/codex.jsonl](../../.agent-log/codex.jsonl) |
| Впевнені помилки | [confident-errors.md](confident-errors.md) |
| Навичка, обидва розташування, спрацювання | [.claude/skills/add-api-route/](../../.claude/skills/add-api-route/) · [.agents/skills/add-api-route/](../../.agents/skills/add-api-route/) · [skill-trigger.md](skill-trigger.md) |
| Заборона: рядок denied | [.agent-log/antigravity.jsonl](../../.agent-log/antigravity.jsonl#L1) (подія `denied` хука `guard-env`) |
| MCP і ціна контексту | [context-cost.md](context-cost.md) |
| Оцінка токенів, кеш, ua/en, три прогони | [cost.md](cost.md) |
| Власний цикл і тести | [src/agent/agent-loop.ts](../../src/agent/agent-loop.ts) · [tests/agent-loop.test.ts](../../tests/agent-loop.test.ts) |
| Порівняння «та сама задача» | [comparison.md](comparison.md) |
| SDK і підтвердження дій | [src/agent/agent-aisdk.ts](../../src/agent/agent-aisdk.ts) · [tests/agent-aisdk.test.ts](../../tests/agent-aisdk.test.ts) |
| Рішення про модель | [model-decision.md](model-decision.md) |
| Переносність | [portability.md](portability.md) |
| Журнал автономності | [autonomy-log.md](autonomy-log.md) |
| Чернетка «Вступу» | [intro-draft.md](intro-draft.md) |
