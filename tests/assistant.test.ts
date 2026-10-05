import { describe, expect, it } from 'vitest';
import {
  buildRagPrompt,
  extractCitations,
  RAG_SYSTEM_PROMPT,
} from '../src/rag';
import type { Chunk, ScoredChunk } from '../src/rag';

describe('RAG Assistant & Prompting (Step 05)', () => {
  const mockChunk1: Chunk = {
    id: 'doc-02#chunk-0',
    docId: 'doc-02.md',
    docTitle: '[doc-02] Розрахунок пульсових зон за формулою Карвонена',
    sectionTitle: 'Формула Карвонена',
    content: 'Цільовий пульс = ((ЧССмакс - ЧССспокою) * %інтенсивності) + ЧССспокою.',
    charStart: 0,
    charEnd: 100,
    tokenCount: 20,
  };

  const mockChunk2: Chunk = {
    id: 'doc-04#chunk-0',
    docId: 'doc-04.md',
    docTitle: '[doc-04] Гідратація та електроліти під час тривалих навантажень',
    sectionTitle: 'Втрата натрію',
    content: 'Втрата натрію з потом становить 500-1000 мг на 1 літр поту.',
    charStart: 0,
    charEnd: 80,
    tokenCount: 18,
  };

  const scoredChunks: ScoredChunk[] = [
    { chunk: mockChunk1, score: 0.85, lexicalScore: 0.9, semanticScore: 0.8 },
    { chunk: mockChunk2, score: 0.65, lexicalScore: 0.6, semanticScore: 0.7 },
  ];

  describe('Prompt Construction', () => {
    it('builds a structured prompt containing injected context and query', () => {
      const { systemPrompt, userPrompt } = buildRagPrompt('Як розрахувати пульс за Карвоненом?', scoredChunks);

      expect(systemPrompt).toBe(RAG_SYSTEM_PROMPT);
      expect(userPrompt).toContain('КОНТЕКСТ З БАЗИ ЗНАНЬ:');
      expect(userPrompt).toContain('--- Джерело [doc-02.md]');
      expect(userPrompt).toContain('Формула Карвонена');
      expect(userPrompt).toContain('Цільовий пульс = ((ЧССмакс - ЧССспокою)');
      expect(userPrompt).toContain('ЗАПИТАННЯ КОРИСТУВАЧА:');
      expect(userPrompt).toContain('Як розрахувати пульс за Карвоненом?');
    });

    it('handles empty context gracefully', () => {
      const { userPrompt } = buildRagPrompt('Яка висота Евересту?', []);
      expect(userPrompt).toContain('*(Жодних релевантних документів не знайдено)*');
      expect(userPrompt).toContain('Яка висота Евересту?');
    });
  });

  describe('Citation Extraction', () => {
    it('extracts single and multiple bracketed doc citations', () => {
      const text = 'Відповідно до [doc-02], пульс рахується так. Також дивіться [doc-04.md].';
      const citations = extractCitations(text);
      expect(citations).toEqual(['doc-02.md', 'doc-04.md']);
    });

    it('deduplicates citations and sorts them', () => {
      const text = 'Згідно з [doc-03] та ще раз [doc-03.md], а також [doc-01].';
      const citations = extractCitations(text);
      expect(citations).toEqual(['doc-01.md', 'doc-03.md']);
    });

    it('handles text without citations', () => {
      const text = 'У наданих документах немає інформації для відповіді на це запитання.';
      const citations = extractCitations(text);
      expect(citations).toEqual([]);
    });

    it('extracts citations embedded inside markdown lists and parentheses', () => {
      const text = `
- Пульсові зони: 5 зон інтенсивності (doc-02).
- Гідратація: 400-800 мл рідини на годину [doc-04].
- Шкала RPE: від 1 до 10 [doc-10.md].
      `;
      const citations = extractCitations(text);
      expect(citations).toEqual(['doc-02.md', 'doc-04.md', 'doc-10.md']);
    });
  });

  describe('System Prompt Safety Constraints', () => {
    it('enforces grounding, unanswerable refusal, and injection defense in prompt', () => {
      expect(RAG_SYSTEM_PROMPT).toContain('ВИКЛЮЧНО на надані фрагменти');
      expect(RAG_SYSTEM_PROMPT).toContain('[doc-XX]');
      expect(RAG_SYSTEM_PROMPT).toContain('UNANSWERABLE');
      expect(RAG_SYSTEM_PROMPT).toContain('PROMPT INJECTION');
    });
  });
});
