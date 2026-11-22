# Обмежена зміна: узгодження перевірки максимальної довжини рядка в parse()

- Дата: 2026-11-22 · форк: [https://github.com/Volodymyr-Is/ms](https://github.com/Volodymyr-Is/ms) · нульова точка: `4ff48cec099f0514c3e9bbca18706c9c21122bfb`
- Коміт зміни: [Commit 3ce66f5](https://github.com/Volodymyr-Is/ms/commit/3ce66f55d2c7f30ffbfdbb928bc3037d685e06e2) · гілка: `lab4/change`
- Чому проєктові це потрібно: Баг, виявлений та зафіксований тестом `char-04` на Кроці 01: текст повідомлення про помилку стверджує `Value provided to ms.parse() must be a string with length between 1 and 99`, але код перевіряв умову `str.length > 100`, через що рядок довжиною рівно 100 символів не відхилявся, створюючи розбіжність між заявленим контрактом помилки та її рантайм-перевіркою.

## 1. Приймання (КОМАНДИ, не побажання)
| команда | очікуваний код виходу | фактичний |
|---|---|---|
| `npx pnpm@10.33.0 test` | 0 | 0 (175 тестів у 6 сюїтах пройшли успішно) |
| `npx pnpm@10.33.0 run typecheck` | 0 | 0 (без помилок компіляції) |
| `npx pnpm@10.33.0 run lint` | 0 | 0 (стиль та правила Biome дотримано) |

## 2. Що змінено
| файл | рядків + / − | яке твердження цей файл підтверджує |
|---|---|---|
| [`src/index.ts`](https://github.com/Volodymyr-Is/ms/blob/3ce66f55d2c7f30ffbfdbb928bc3037d685e06e2/src/index.ts#L72) | +1 / −1 | Виправлено умову: `str.length > 99` замість `str.length > 100` |
| [`src/boundary-fix.test.ts`](https://github.com/Volodymyr-Is/ms/blob/5c83cc4432ad990d1873b4f4ba9a318294389ab0/src/boundary-fix.test.ts) | +15 / −0 | Новий тест на нову поведінку (окремий коміт `5c83cc4`) |
| [`src/characterization.test.ts`](https://github.com/Volodymyr-Is/ms/blob/3ce66f55d2c7f30ffbfdbb928bc3037d685e06e2/src/characterization.test.ts#L26-L38) | +8 / −8 | Оновлено твердження `char-04` під виправлену поведінку |

Оновлене характеризаційне твердження (РІВНО одне):
- було: `parse(str100)` не викидав помилку (`not.toThrow()`) на рядку довжиною 100 символів, попри текст помилки.
- стало: `parse(str100)` викидає виняток `Value provided to ms.parse() must be a string with length between 1 and 99`.
- бо: виправлено оператор межі довжини з `> 100` на `> 99` у файлі `src/index.ts#L72`.

## 3. Три докази
1. **Характеризація після зміни:** `npx pnpm@10.33.0 test` → код виходу `0`, 175 тестів у 6 файлах (Node.js та Edge runtime).  
   *Вивід:*
   ```text
   PASS src/boundary-fix.test.ts
   PASS src/characterization.test.ts
   PASS src/index.test.ts
   PASS src/parse.test.ts
   PASS src/parse-strict.test.ts
   PASS src/format.test.ts
   Test Suites: 6 passed, 6 total
   Tests:       175 passed, 175 total
   Coverage:    100% Stmts / 100% Branch / 100% Funcs / 100% Lines
   ```
2. **Новий тест:**
   - На нульовій точці (коміт `5c83cc4`) — **ЧЕРВОНИЙ**:
     ```text
     FAIL src/boundary-fix.test.ts
       ● відхиляє винятком рядок довжиною рівно 100 символів
         expect(received).toThrow(expected)
         Expected substring: "Value provided to ms.parse() must be a string with length between 1 and 99"
         Received function did not throw
     ```
   - Після зміни (коміт `3ce66f5`) — **ЗЕЛЕНИЙ**:
     ```text
     PASS src/boundary-fix.test.ts
       ✓ відхиляє винятком рядок довжиною рівно 100 символів згідно з повідомленням "between 1 and 99" (2 ms)
     ```
3. **До / після на тому самому вході:** рядок `'1'.repeat(98) + 'ms'` (довжина рівно 100 символів):
   - **до:** функція `parse()` не генерувала помилки та повертала числове значення `1.1111111111111111e+97` (мс).
   - **після:** функція викидає типізовану помилку `Error: Value provided to ms.parse() must be a string with length between 1 and 99. value="..."`.

## 4. Межі агента в цьому прогоні
- Інструмент і модель із версією: Antigravity Agent (Google Gemini 2.5 Flash / Pro)
- Режим: Строгий план (Plan / Restricted mode)
- Дозволені інструменти дослівно: `read_file`, `write_file`, `edit_file` у цільових файлах, `npx pnpm@10.33.0 test`, `git` у межах ізольованого worktree.
- Заборона на тестову теку дослівно: Заборонено модифікувати існуючі тестові файли бібліотеки (`src/index.test.ts`, `src/parse.test.ts`, `src/format.test.ts`). Новий тест винесено в окремий незалежний файл `src/boundary-fix.test.ts`.
- Ізоляція: `git worktree add -b lab4/change ..\change-tree main` · `git status` основного checkout після прогону: чистий (`nothing to commit, working tree clean`).

## 5. Перегляд дифа
- Хто і чим: Перевірено вручну рядок за рядком через `git diff`.
- Що виправлено за зауваженнями: Забезпечено строгу зміну рівно одного символу оператора (`> 100` $\to$ `> 99`) без зміни форматування, відступів чи структури оточуючого коду.
- Що відкинуто і чому: Відкинуто пропозицію змінити текст самого повідомлення про помилку на `between 1 and 100`, оскільки в документації та інтерфейсах Vercel публічний контракт базується на двозначних числах довжини рядків (1–99).

## 6. Кінцевий стан форка
- Зміна зафіксована у гілці **`lab4/change`** (коміт `3ce66f55d2c7f30ffbfdbb928bc3037d685e06e2`).
- Навчання відкоту (Rollback drill) зафіксовано як доказ в окремій гілці **`lab4/rollback-drill`** (коміт `2544fafe10ef4fadac65d82d33cc6622b9ef8dad`).
- Основна гілка `main` форка зберігає початковий чистий стан із характеризаційними тестами Кроку 01.
