# Траси паралельного оцінювання (Крок 07)

У цій теці зафіксовано сирі JSON-артефакти вимірювання паралельності пулу субагентів відповідно до вимог Лабораторної 2 (Крок 07).

## Файли трас

1. **[`parallel-run-width1.json`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/docs/lab2/traces/parallel-run-width1.json)**:
   - **Режим:** Послідовне виконання (ширина пулу = 1).
   - **Час стіни (`wallMs`):** 409 487 мс (~409.5 с).
   - **Сума часу гілок (`sumBranchMs`):** 409 488 мс.
   - **Токени (In / Out):** 20 582 / 26 172.
   - **Статус:** 20/20 виконано, 0 помилок.

2. **[`parallel-run-width4.json`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/docs/lab2/traces/parallel-run-width4.json)**:
   - **Режим:** Паралельне виконання (ширина пулу = 4).
   - **Час стіни (`wallMs`):** 658 918 мс (~658.9 с).
   - **Сума часу гілок (`sumBranchMs`):** 1 024 643 мс.
   - **Ефективний коефіцієнт прискорення (`sumBranchMs / wallMs`):** 1.56x.
   - **Токени (In / Out):** 20 585 / 84 873.
   - **Статус:** 20/20 виконано, 0 помилок.

## Траси підключення MCP-сервера (Крок 09)

3. **[`mcp-agent-call.json`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/docs/lab2/traces/mcp-agent-call.json)**:
   - **Джерело:** Агент кодування (`antigravity-coding-agent`).
   - **Конфігурація:** `.mcp-config.json`.
   - **Виклики:** `tools/list` (виявлено 2 інструменти), `tools/call:search_knowledge_base` (знайдено 2 чанки з `[doc-05]`), `tools/call:get_document_by_id` (отримано `doc-05`).
   - **Latency інструментів:** 3–6 мс.

4. **[`mcp-app-call.json`](file:///c:/Users/volod/OneDrive/Документи/GitHub/AI-41-Agents-Project/docs/lab2/traces/mcp-app-call.json)**:
   - **Джерело:** Застосунок «Спортивний журнал» (`sports-journal-app`).
   - **Конфігурація:** `src/mcp/app-config.json` через `SportsJournalAppClient`.
   - **Сценарій користувача:** Розрахунок цільових пульсових зон за формулою Карвонена для тренування.
   - **Виклики:** `search_knowledge_base` (`query: "формула Карвонена пульсові зони"`), `get_document_by_id` (`id: "doc-02"`).
   - **Фінальний результат:** Сформовано пораду атлету з обов'язковою цитатою `[doc-02]`.

