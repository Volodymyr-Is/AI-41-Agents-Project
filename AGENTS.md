# AGENTS.md

- Спортивний журнал з можливістю зберігати пророблену роботу та аналізувати і покращувати її за допомогою ШІ для спортсменів та любителів спорту.

## Стек

- TypeScript (`strict`), Next.js (App Router), Vitest.

## Команди

- `npm test` — тести (Vitest), без мережі.
- `npm run typecheck` — перевірка типів, без емісії.
- `npm run lint` — лінтер.
- `git status`, `git diff`, `git log`, `git branch` (без модифікацій) - лише читання.

## Межі

- `.env` і `.env.local` агент не читає і не редагує: секрети веде людина.
- `.agent-log/` не редагуй: це журнал, його пише hook.
- Тести не ходять у мережу і не викликають платні API.
- Деструктивні git-команди: `git reset`, `git clean`, `git restore`, `git checkout .`, `git branch -D` - лише після мого «так».
- `npm install`, `npm update`, `package.json` і `package-lock.json` — лише після мого «так».