import fs from 'node:fs';
import path from 'node:path';
import { SportsJournalAppClient } from '../src/mcp/app-client';

interface AppTraceEntry {
  timestamp: string;
  source: 'sports-journal-app';
  clientName: string;
  userScenario: string;
  userQuery: string;
  mcpCalls: {
    tool: string;
    arguments: Record<string, unknown>;
    resultSummary: Record<string, unknown>;
    latencyMs: number;
  }[];
  finalApplicationOutput: {
    adviceTitle: string;
    keyPoints: string[];
    citations: string[];
  };
  totalLatencyMs: number;
}

async function runApplicationDemo() {
  console.log('🏃 === Запуск демонстрації підключення MCP до Застосунку «Спортивний журнал» ===\n');

  const client = new SportsJournalAppClient();

  const userScenario = 'Спортсмен вносить нове тренування та запитує розрахунок цільових пульсових зон';
  const userQuery = 'Як правильно розрахувати пульсові зони за формулою Карвонена?';

  console.log(`[Сценарій користувача]: ${userScenario}`);
  console.log(`[Запит спортсмена]: "${userQuery}"\n`);

  const startTime = Date.now();

  console.log('[1] Застосунок ініціалізує зв\'язок із сервером через SportsJournalAppClient...');
  await client.connect();
  console.log('    Підключено успішно.');

  const tools = await client.listTools();
  console.log(`[2] Виявлено інструментів сервера: ${tools.tools.length} (${tools.tools.map((t) => t.name).join(', ')})`);

  const mcpCalls: AppTraceEntry['mcpCalls'] = [];

  // Крок 1: Пошук у базі знань через MCP
  console.log('\n[3] Застосунок звертається до MCP: search_knowledge_base...');
  const searchStart = Date.now();
  const searchData = await client.searchKnowledgeBase('формула Карвонена пульсові зони', 2);
  const searchLatency = Date.now() - searchStart;

  console.log(`    Знайдено фрагментів: ${searchData.response.totalFound} (за ${searchLatency} мс)`);
  searchData.response.results.forEach((r, idx) => {
    console.log(`    #${idx + 1}: ${r.title} ${r.citation} [score: ${r.score}]`);
  });

  mcpCalls.push({
    tool: 'search_knowledge_base',
    arguments: { query: 'формула Карвонена пульсові зони', topK: 2 },
    resultSummary: {
      totalFound: searchData.response.totalFound,
      topCitation: searchData.response.results[0]?.citation,
      topChunkId: searchData.response.results[0]?.chunkId,
    },
    latencyMs: searchLatency,
  });

  // Крок 2: Отримання повного тексту статті doc-02
  console.log('\n[4] Застосунок звертається до MCP: get_document_by_id ("doc-02")...');
  const docStart = Date.now();
  const docData = await client.getDocumentById('doc-02');
  const docLatency = Date.now() - docStart;

  console.log(`    Статтю завантажено: "${docData.response.title}" (${docLatency} мс)`);
  console.log(`    Ліцензія: ${docData.response.license}, кількість чанків: ${docData.response.chunksCount}`);

  mcpCalls.push({
    tool: 'get_document_by_id',
    arguments: { id: 'doc-02' },
    resultSummary: {
      id: docData.response.id,
      title: docData.response.title,
      license: docData.response.license,
      length: docData.response.content.length,
    },
    latencyMs: docLatency,
  });

  // Крок 3: Синтез фінальної картки поради для спортсмена
  const finalAdvice = {
    adviceTitle: 'Розрахунок пульсових зон для щоденника тренувань',
    keyPoints: [
      'Формула Карвонена: ЧСС_цільова = ((ЧСС_макс - ЧСС_спокою) * %інтенсивності) + ЧСС_спокою [doc-02].',
      'Для аеробної зони відновлення рекомендується діапазон 60-70% резерву пульсу [doc-02].',
      'Обов\'язково вимірювати ЧСС спокою вранці до підйому з ліжка для точності розрахунку.',
    ],
    citations: ['[doc-02]'],
  };

  console.log('\n[5] Застосунок сформував тренувальну пораду для атлета:');
  finalAdvice.keyPoints.forEach((p) => console.log(`    • ${p}`));

  await client.close();
  console.log('\n[6] З\'єднання клієнта застосунку закрито.');

  const totalLatencyMs = Date.now() - startTime;

  const appTrace: AppTraceEntry = {
    timestamp: new Date().toISOString(),
    source: 'sports-journal-app',
    clientName: 'sports-journal-app',
    userScenario,
    userQuery,
    mcpCalls,
    finalApplicationOutput: finalAdvice,
    totalLatencyMs,
  };

  const traceFile = path.resolve(process.cwd(), 'docs/lab2/traces/mcp-app-call.json');
  fs.writeFileSync(traceFile, JSON.stringify(appTrace, null, 2), 'utf8');
  console.log(`\n💾 Трасу викликів застосунку збережено в: docs/lab2/traces/mcp-app-call.json`);
}

runApplicationDemo().catch((err) => {
  console.error('Помилка виконання демо застосунку:', err);
  process.exit(1);
});
