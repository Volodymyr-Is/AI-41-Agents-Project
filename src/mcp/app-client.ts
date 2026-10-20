import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import appConfig from './app-config.json';

export interface SearchResultItem {
  chunkId: string;
  docId: string;
  title: string;
  content: string;
  score: number;
  citation: string;
}

export interface SearchResponse {
  query: string;
  totalFound: number;
  results: SearchResultItem[];
}

export interface DocumentResponse {
  id: string;
  title: string;
  source: string;
  license: string;
  chunksCount: number;
  content: string;
}

/**
 * Клієнт застосунку спортивного журналу для взаємодії з MCP-сервером
 */
export class SportsJournalAppClient {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private isConnected = false;

  constructor() {
    this.client = new Client({
      name: appConfig.client.name,
      version: appConfig.client.version,
    });
  }

  /**
   * Підключення до MCP-сервера через stdio child process
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    const projectRoot = process.cwd();
    const serverScript = path.resolve(projectRoot, 'src/mcp/server.ts');

    this.transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', serverScript],
      cwd: projectRoot,
    });

    await this.client.connect(this.transport);
    this.isConnected = true;
  }

  /**
   * Отримання списку доступних інструментів
   */
  async listTools() {
    this.ensureConnected();
    return this.client.listTools();
  }

  /**
   * Пошук у спортивній базі знань через MCP інструмент search_knowledge_base
   */
  async searchKnowledgeBase(
    query: string,
    topK = 3
  ): Promise<{ response: SearchResponse; rawText: string }> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'search_knowledge_base',
      arguments: { query, topK },
    });

    if (result.isError) {
      throw new Error(`MCP tool search_knowledge_base error: ${JSON.stringify(result.content)}`);
    }

    const firstContent = result.content[0];
    if (!firstContent || firstContent.type !== 'text') {
      throw new Error('Unexpected non-text content from MCP server');
    }

    const rawText = firstContent.text;
    const parsed: SearchResponse = JSON.parse(rawText);
    return { response: parsed, rawText };
  }

  /**
   * Отримання повного тексту документа через MCP інструмент get_document_by_id
   */
  async getDocumentById(
    id: string
  ): Promise<{ response: DocumentResponse; rawText: string }> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name: 'get_document_by_id',
      arguments: { id },
    });

    if (result.isError) {
      throw new Error(`MCP tool get_document_by_id error: ${JSON.stringify(result.content)}`);
    }

    const firstContent = result.content[0];
    if (!firstContent || firstContent.type !== 'text') {
      throw new Error('Unexpected non-text content from MCP server');
    }

    const rawText = firstContent.text;
    const parsed: DocumentResponse = JSON.parse(rawText);
    return { response: parsed, rawText };
  }

  /**
   * Закриття з'єднання
   */
  async close(): Promise<void> {
    if (!this.isConnected) return;
    await this.client.close();
    this.isConnected = false;
  }

  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new Error('SportsJournalAppClient is not connected. Call connect() first.');
    }
  }
}
