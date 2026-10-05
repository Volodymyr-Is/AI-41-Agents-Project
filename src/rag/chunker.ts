import fs from 'node:fs';
import path from 'node:path';
import type { Chunk, ChunkOptions, Document } from './types';

export interface ResolvedChunkOptions {
  maxChunkSize: number;
  minChunkSize: number;
  overlap: number;
}

export const DEFAULT_CHUNK_OPTIONS: ResolvedChunkOptions = {
  maxChunkSize: 450,
  minChunkSize: 40,
  overlap: 60,
};

/**
 * Approximate token count for mixed Ukrainian/English text.
 * ~4-5 characters per token average.
 */
export function estimateTokenCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(words.length * 1.3));
}

/**
 * Loads all markdown (.md) documents from a target directory.
 */
export function loadDocumentsFromDir(dirPath: string): Document[] {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();

  return mdFiles.map((fileName) => {
    const fullPath = path.join(dirPath, fileName);
    const content = fs.readFileSync(fullPath, 'utf8');
    const firstLine = content.split('\n')[0]?.trim() ?? '';
    const title = firstLine.startsWith('#')
      ? firstLine.replace(/^#+\s*/, '')
      : fileName;

    return {
      id: fileName,
      title,
      content,
      path: fullPath,
    };
  });
}

/**
 * Splits a single document into contextual chunks.
 * Preserves Markdown header hierarchy (H1, H2, H3).
 */
export function chunkDocument(
  doc: Document,
  customOptions?: ChunkOptions
): Chunk[] {
  const maxChunkSize: number = customOptions?.maxChunkSize ?? DEFAULT_CHUNK_OPTIONS.maxChunkSize;
  const minChunkSize: number = customOptions?.minChunkSize ?? DEFAULT_CHUNK_OPTIONS.minChunkSize;
  const lines = doc.content.split('\n');
  const chunks: Chunk[] = [];

  let currentDocTitle = doc.title;
  let currentSectionTitle = '';
  let currentBuffer: string[] = [];
  let bufferStartOffset = 0;
  let currentOffset = 0;
  let chunkIndex = 0;

  function flushBuffer() {
    const rawText = currentBuffer.join('\n').trim();
    if (rawText.length < minChunkSize && chunks.length > 0) {
      // Append small leftovers to previous chunk if possible
      const prevChunk = chunks[chunks.length - 1];
      if (prevChunk && prevChunk.content.length + rawText.length <= maxChunkSize * 1.5) {
        prevChunk.content += '\n\n' + rawText;
        prevChunk.charEnd += rawText.length + 2;
        prevChunk.tokenCount = estimateTokenCount(prevChunk.content);
        currentBuffer = [];
        return;
      }
    }

    if (rawText.length > 0) {
      const chunk: Chunk = {
        id: `${doc.id.replace(/\.md$/, '')}#chunk-${chunkIndex++}`,
        docId: doc.id,
        docTitle: currentDocTitle,
        sectionTitle: currentSectionTitle || undefined,
        content: rawText,
        charStart: bufferStartOffset,
        charEnd: bufferStartOffset + rawText.length,
        tokenCount: estimateTokenCount(rawText),
      };
      chunks.push(chunk);
    }
    currentBuffer = [];
  }

  for (const line of lines) {
    const lineLen = line.length + 1; // including newline

    // Check for headers
    if (/^#\s+/.test(line)) {
      if (currentBuffer.length > 0) {
        flushBuffer();
      }
      currentDocTitle = line.replace(/^#\s+/, '').trim();
      bufferStartOffset = currentOffset;
      currentOffset += lineLen;
      continue;
    }

    if (/^##+\s+/.test(line)) {
      if (currentBuffer.length > 0) {
        flushBuffer();
      }
      currentSectionTitle = line.replace(/^##+\s+/, '').trim();
      bufferStartOffset = currentOffset;
      currentOffset += lineLen;
      continue;
    }

    // Check length overflow
    const candidateLen = currentBuffer.join('\n').length + lineLen;
    if (candidateLen > maxChunkSize && currentBuffer.length > 0) {
      flushBuffer();
      bufferStartOffset = currentOffset;
    }

    currentBuffer.push(line);
    currentOffset += lineLen;
  }

  if (currentBuffer.length > 0) {
    flushBuffer();
  }

  return chunks;
}

/**
 * Chunks an entire collection of documents.
 */
export function chunkDocuments(
  docs: Document[],
  options?: ChunkOptions
): Chunk[] {
  const allChunks: Chunk[] = [];
  for (const doc of docs) {
    allChunks.push(...chunkDocument(doc, options));
  }
  return allChunks;
}
