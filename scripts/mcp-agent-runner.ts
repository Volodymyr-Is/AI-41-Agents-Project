import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

interface TraceEntry {
  timestamp: string;
  source: 'coding-agent';
  agentName: string;
  serverCommand: string;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  latencyMs: number;
}

async function runCodingAgentDemo() {
  console.log('🤖 === Запуск демонстрації підключення MCP до Агента кодування ===\n');

  const configPath = path.resolve(process.cwd(), '.mcp-config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Файл конфігурації агента не знайдено: ${configPath}`);
  }

  const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const serverConfig = rawConfig.mcpServers?.['sports-journal'];
  if (!serverConfig) {
    throw new Error('У .mcp-config.json відсутній сервер sports-journal');
  }

  console.log(`[1] Зчитано конфігурацію агента: command="${serverConfig.command}", args=${JSON.stringify(serverConfig.args)}`);

  const transport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args,
    cwd: process.cwd(),
  });

  const agentClient = new Client({
    name: 'antigravity-coding-agent',
    version: '2.0.0',
  });

  const traceLog: TraceEntry[] = [];

  const startConnect = Date.now();
  await agentClient.connect(transport);
  const connectMs = Date.now() - startConnect;
  console.log(`[2] Підключено до MCP-сервера через stdio за ${connectMs} мс`);

  // 1. Отримання списку інструментів
  const startList = Date.now();
  const toolsList = await agentClient.listTools();
  const listMs = Date.now() - startList;
  console.log(`[3] Агент виявив інструменти (${listMs} мс):`, toolsList.tools.map((t) => t.name).join(', '));

  traceLog.push({
    timestamp: new Date().toISOString(),
    source: 'coding-agent',
    agentName: 'antigravity-coding-agent',
    serverCommand: `${serverConfig.command} ${serverConfig.args.join(' ')}`,
    action: 'tools/list',
    input: {},
    output: { tools: toolsList.tools.map((t) => ({ name: t.name, description: t.description })) },
    latencyMs: listMs,
  });

  // 2. Виклик search_knowledge_base
  const query = 'періодизація навантажень мезоцикли';
  const topK = 2;
  console.log(`\n[4] Агент виконує tool_call: search_knowledge_base (query="${query}", topK=${topK})`);
  const startSearch = Date.now();
  const searchResult = await agentClient.callTool({
    name: 'search_knowledge_base',
    arguments: { query, topK },
  });
  const searchMs = Date.now() - startSearch;

  const searchContent = searchResult.content[0];
  const searchParsed = searchContent?.type === 'text' ? JSON.parse(searchContent.text) : {};
  console.log(`    Знайдено фрагментів: ${searchParsed.totalFound}, latency: ${searchMs} мс`);
  if (searchParsed.results?.[0]) {
    console.log(`    Топ-результат: ${searchParsed.results[0].title} ${searchParsed.results[0].citation} (score: ${searchParsed.results[0].score})`);
  }

  traceLog.push({
    timestamp: new Date().toISOString(),
    source: 'coding-agent',
    agentName: 'antigravity-coding-agent',
    serverCommand: `${serverConfig.command} ${serverConfig.args.join(' ')}`,
    action: 'tools/call:search_knowledge_base',
    input: { query, topK },
    output: searchParsed,
    latencyMs: searchMs,
  });

  // 3. Виклик get_document_by_id
  const docId = 'doc-05';
  console.log(`\n[5] Агент виконує tool_call: get_document_by_id (id="${docId}")`);
  const startDoc = Date.now();
  const docResult = await agentClient.callTool({
    name: 'get_document_by_id',
    arguments: { id: docId },
  });
  const docMs = Date.now() - startDoc;

  const docContent = docResult.content[0];
  const docParsed = docContent?.type === 'text' ? JSON.parse(docContent.text) : {};
  console.log(`    Отримано документ: "${docParsed.title}", ліцензія: ${docParsed.license}, latency: ${docMs} мс`);

  traceLog.push({
    timestamp: new Date().toISOString(),
    source: 'coding-agent',
    agentName: 'antigravity-coding-agent',
    serverCommand: `${serverConfig.command} ${serverConfig.args.join(' ')}`,
    action: 'tools/call:get_document_by_id',
    input: { id: docId },
    output: {
      id: docParsed.id,
      title: docParsed.title,
      source: docParsed.source,
      license: docParsed.license,
      chunksCount: docParsed.chunksCount,
      contentSnippet: docParsed.content?.slice(0, 150) + '...',
    },
    latencyMs: docMs,
  });

  await agentClient.close();
  console.log('\n[6] З\'єднання з MCP-сервером успішно закрито');

  // Збереження траси
  const traceFile = path.resolve(process.cwd(), 'docs/lab2/traces/mcp-agent-call.json');
  fs.writeFileSync(traceFile, JSON.stringify(traceLog, null, 2), 'utf8');
  console.log(`\n💾 Трасу викликів агента кодування збережено в: docs/lab2/traces/mcp-agent-call.json`);
}

runCodingAgentDemo().catch((err) => {
  console.error('Помилка виконання демо агента кодування:', err);
  process.exit(1);
});
