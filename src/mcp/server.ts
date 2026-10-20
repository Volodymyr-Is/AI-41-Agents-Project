import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { HybridIndex } from '../rag/hybrid-index';

/**
 * Білий список зареєстрованих спортивних документів згідно зі spec.md
 */
export const DOCUMENT_REGISTRY: Record<
  string,
  { title: string; source: string; license: string }
> = {
  'doc-01': {
    title: 'Основи побудови тренувального мікроциклу',
    source: 'Методичний посібник з легкої атлетики (відкритий доступ)',
    license: 'CC BY 4.0',
  },
  'doc-02': {
    title: 'Розрахунок пульсових зон за формулою Карвонена',
    source: 'Публічні спортивні нормативи',
    license: 'Public Domain',
  },
  'doc-03': {
    title: 'Протокол силового тренування для бігунів',
    source: 'Відкриті рекомендації спортивних федерацій',
    license: 'CC BY-SA 4.0',
  },
  'doc-04': {
    title: 'Гідратація та електроліти під час тривалих навантажень',
    source: 'Оглядова стаття спортивної медицини',
    license: 'CC BY 4.0',
  },
  'doc-05': {
    title: 'Періодизація навантажень: мезоцикли та макроцикли',
    source: 'Конспект лекцій з теорії спорту',
    license: 'Власний конспект',
  },
  'doc-06': {
    title: 'Відновлення після інтенсивного навантаження',
    source: 'Рекомендації бігових клубів',
    license: 'CC BY 4.0',
  },
  'doc-07': {
    title: 'Ознаки перетренованості та методи діагностики',
    source: 'Спортивна фізіологія (публічний дайджест)',
    license: 'CC BY 4.0',
  },
  'doc-08': {
    title: 'Базові принципи розминки та заминки',
    source: 'Навчальні матеріали тренера',
    license: 'Власний матеріал',
  },
  'doc-09': {
    title: 'Вуглеводне завантаження перед змаганнями',
    source: 'Посібник зі спортивного харчування',
    license: 'CC BY-NC 4.0',
  },
  'doc-10': {
    title: 'Нормативи та шкала навантажень RPE (Borg Scale)',
    source: 'Стандарт шкали сприйняття навантаження',
    license: 'Public Domain',
  },
};

/**
 * Валідаційна схема вхідних параметрів інструмента search_knowledge_base
 */
export const SearchInputSchema = z.object({
  query: z
    .string()
    .min(1, 'Пошуковий запит не може бути порожнім')
    .max(500, 'Запит не може перевищувати 500 символів'),
  topK: z
    .number()
    .int('topK має бути цілим числом')
    .min(1, 'topK має бути щонайменше 1')
    .max(5, 'topK не може перевищувати 5')
    .default(3),
});

/**
 * Валідаційна схема вхідних параметрів інструмента get_document_by_id
 */
export const DocumentInputSchema = z.object({
  id: z
    .string()
    .regex(
      /^doc-(0[1-9]|10)$/,
      'Невалідний id документа. Дозволені значення: doc-01 ... doc-10'
    ),
});

export interface ServerOptions {
  dataDir?: string;
}

/**
 * Фабрика створення та конфігурації MCP-сервера sports-journal-mcp
 */
export function createSportsJournalServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer({
    name: 'sports-journal-mcp',
    version: '1.0.0',
  });

  const resolvedDataDir =
    options.dataDir ?? path.resolve(process.cwd(), 'docs/lab2/data');
  const hybridIndex = new HybridIndex();

  if (fs.existsSync(resolvedDataDir)) {
    hybridIndex.loadFromDirectory(resolvedDataDir);
  }

  // Реєстрація інструмента search_knowledge_base
  server.registerTool(
    'search_knowledge_base',
    {
      title: 'Пошук у спортивній базі знань',
      description:
        'Гібридний пошук (BM25 + Semantic) по верифікованих статтях спортивного щоденника з цитуванням джерел [doc-XX]. Межа: виключно зареєстровані статті docs/lab2/data, topK <= 5.',
      inputSchema: SearchInputSchema,
    },
    async ({ query, topK }) => {
      const results = hybridIndex.search(query, { topK });
      const formatted = results.map((r) => {
        const docIdClean = r.chunk.docId.replace(/\.md$/, '');
        return {
          chunkId: r.chunk.id,
          docId: docIdClean,
          title: r.chunk.docTitle,
          content: r.chunk.content,
          score: Number(r.score.toFixed(4)),
          citation: `[${docIdClean}]`,
        };
      });

      const payload = {
        query,
        totalFound: formatted.length,
        results: formatted,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(payload, null, 2),
          },
        ],
        structuredContent: payload,
      };
    }
  );

  // Реєстрація інструмента get_document_by_id
  server.registerTool(
    'get_document_by_id',
    {
      title: 'Отримати документ за ID',
      description:
        'Отримання повного тексту та метаданих спортивної статті за її ID (doc-01 ... doc-10). Межа: сувора заборона path traversal, читання лише файлів із білого списку.',
      inputSchema: DocumentInputSchema,
    },
    async ({ id }) => {
      // Додатковий захист від Path Traversal
      if (id.includes('/') || id.includes('\\') || id.includes('..')) {
        throw new Error(
          `Security boundary violation: path traversal detected in id "${id}"`
        );
      }

      const meta = DOCUMENT_REGISTRY[id];
      if (!meta) {
        throw new Error(
          `Документ з id "${id}" не знайдено у зареєстрованій базі знань`
        );
      }

      const filePath = path.join(resolvedDataDir, `${id}.md`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Файл документа ${id} відсутній на диску: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const allChunks = hybridIndex
        .search(meta.title, { topK: 10 })
        .filter((c) => c.chunk.docId.replace(/\.md$/, '') === id);

      const payload = {
        id,
        title: meta.title,
        source: meta.source,
        license: meta.license,
        chunksCount: allChunks.length,
        content,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(payload, null, 2),
          },
        ],
        structuredContent: payload,
      };
    }
  );

  return server;
}

// Прямий запуск через stdio (наприклад, tsx src/mcp/server.ts)
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const server = createSportsJournalServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
