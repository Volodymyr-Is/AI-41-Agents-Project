# Оцінка вартості контексту та підключення MCP (Context7)

- **Дата:** 25.09.2026
- **Підключений MCP-сервер:** Context7 (`https://mcp.context7.com/mcp`)
- **Призначення:** Отримання актуальної, версійно-специфічної документації бібліотек та прикладів коду без галюцинацій.

---

## 1. Конфігурація підключення для двох агентів

### Codex CLI
У файлі конфігурації `~/.codex/config.toml`:
```toml
[mcp_servers.context7]
url = "https://mcp.context7.com/mcp"
```

### Antigravity CLI / IDE
У файлі конфігурації `.agents/mcp_config.json`:
```json
{
  "mcpServers": {
    "context7": {
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

---

## 2. Експортовані інструменти та їхні схеми

Context7 експортує два інструменти:

1. **`resolve-library-id`**
   - **Опис:** Пошук унікального ідентифікатора бібліотеки у базі Context7 за її назвою або ключовими словами.
   - **Параметри JSON Schema:** `query` (string, required).
2. **`get-library-docs`**
   - **Опис:** Отримання актуального фрагмента документації, сигнатур функцій та прикладів використання.
   - **Параметри JSON Schema:** `libraryId` (string, required), `topic` (string, optional), `tokens` (number, optional).

Повний JSON-об'єкт схем:
```json
[
  {
    "name": "resolve-library-id",
    "description": "Resolve a package/library name or query to a Context7-compatible library identifier.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "The name of the library or framework to search for."
        }
      },
      "required": ["query"]
    }
  },
  {
    "name": "get-library-docs",
    "description": "Fetch up-to-date documentation, API signatures, and examples for a specific library.",
    "parameters": {
      "type": "object",
      "properties": {
        "libraryId": {
          "type": "string",
          "description": "The exact library ID returned from resolve-library-id."
        },
        "topic": {
          "type": "string",
          "description": "Optional specific topic, feature, or function name."
        },
        "tokens": {
          "type": "number",
          "description": "Optional limit on max tokens returned."
        }
      },
      "required": ["libraryId"]
    }
  }
]
```

---

## 3. Вимірювання накладних витрат токенів (Context Overhead)

Згідно з вимірюванням через токенізатор OpenAI (`cl100k_base` / `o200k_base`):
- `resolve-library-id`: **95 токенів**
- `get-library-docs`: **147 токенів**
- **Загальний обсяг схеми (Tools Schema Overhead):** **242 токени** (1 063 символи).

Ці **242 токени** надсилаються в системному контексті на **кожному кроці** сесії агента.

### Розрахунок витрат на основі моделей нашого проєкту (`src/models.ts`):

Ціни за 1 000 000 вхідних токенів згідно з реєстром `src/models.ts`:
- **`gemini-3.8-flash`** (Google Antigravity promo): $0.75 / 1M input tokens.
- **`MODELS.cheap`** (`claude-haiku-4-5`): $1.00 / 1M input tokens.
- **`gpt-5.6-terra`** (OpenAI Codex) / **`MODELS.balanced`** (`claude-sonnet-5`): $2.00 / 1M input tokens.

| Довжина сесії (кроки) | Сумарний оверхед схем (вхідні токени) | `gemini-3.8-flash` ($0.75 / 1M) | `MODELS.cheap` ($1.00 / 1M) | `gpt-5.6-terra` / `MODELS.balanced` ($2.00 / 1M) |
|---|---|---|---|---|
| **10 кроків** | 2 420 токенів | $0.00182 | $0.00242 | $0.00484 |
| **25 кроків** | 6 050 токенів | $0.00454 | $0.00605 | $0.01210 |
| **50 кроків** | 12 100 токенів | $0.00908 | $0.01210 | $0.02420 |
| **100 кроків** | 24 200 токенів | $0.01815 | $0.02420 | $0.04840 |

*Примітка:* При реальному виклику інструменту `get-library-docs` повернутий вміст документації додатково додає від **1 500 до 5 000 токенів** до історії сесії, що збільшує кумулятивну вартість наступних запитів.

---

## 4. Ризики та аналіз безпеки

### 1. Проблема розмивання контексту ("Context Bloat" / "Lost in the Middle")
- Якщо підключити 5–10 різноманітних MCP-серверів (бази даних, GitHub, браузер, файлові системи, пошуковики), лише описи схем інструментів займуть від **2 000 до 6 000 токенів** у кожному запиті.
- Це призводить до:
  - Зниження уваги моделі до специфічних інструкцій з `AGENTS.md`.
  - Зростання ймовірності помилкового вибору інструменту або некоректної генерації аргументів.
  - Додаткової фінансової вартості за «холостий» прогін схем.

### 2. Безпека та сторонній код
- Віддалені MCP-сервери (через HTTP/SSE) отримують запити агента та можуть повертати неперевірений контент, що відкриває потенційний вектор для **Indirect Prompt Injection** (коли шкідлива інструкція ховається у завантаженій документації).
- Локальні сервери, що запускаються через `npx`, виконують Node.js-код у системі користувача, тому повинні бути перевіреними та мати фіксовані версії.

---

## 5. Висновок і рекомендації для проєкту

1. **Мінімалізм інструментів:** Підключати лише ті MCP-сервери, які дійсно потрібні для конкретної задачі.
2. **Кешування промптів (Prompt Caching):** Сучасні моделі підтримують кешування префіксів (`minCachePrefixTokens` у `src/models.ts`). Статичні описи інструментів на початку системного промпту дозволяють економити на повторних запитах, якщо їхній порядок не змінюється.
3. **Захист від витоку даних:** Усі чутливі файли (`.env`, `.env.local`) повинні блокуватися на рівні `PreToolUse` Guard Hooks незалежно від підключених MCP-серверів.
