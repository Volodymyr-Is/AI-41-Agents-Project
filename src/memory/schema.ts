import { z } from 'zod';

export const MemoryKindSchema = z.enum(['decision', 'constraint', 'outcome']);
export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export const MemoryRepoSchema = z.enum(['course', 'fork']);
export type MemoryRepo = z.infer<typeof MemoryRepoSchema>;

// Патерни заборонених даних: секрети, приватні ключі, токени, паролі, персональні дані
const FORBIDDEN_SECRET_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/i, // Google API key
  /sk-[a-zA-Z0-9]{20,}/i, // OpenAI secret key
  /ghp_[a-zA-Z0-9]{20,}/i, // GitHub personal access token
  /gho_[a-zA-Z0-9]{20,}/i, // GitHub OAuth token
  /bearer\s+[a-zA-Z0-9_\-\.=:_\+\/]{20,}/i, // Bearer token
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i, // Private key
  /password\s*[:=]\s*["']?[^\s"']{6,}["']?/i, // Password in text
  /api[_-]?key\s*[:=]\s*["']?[^\s"']{8,}["']?/i, // Generic API key
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email (персональні дані)
  /\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/, // Номер телефону
];

export const MemoryEntrySchema = z.object({
  at: z.string().datetime({ message: 'Must be a valid ISO 8601 datetime' }),
  kind: MemoryKindSchema,
  text: z
    .string()
    .min(1, 'Text cannot be empty')
    .max(200, 'Text must be at most 200 characters')
    .refine(
      (val) => !FORBIDDEN_SECRET_PATTERNS.some((pattern) => pattern.test(val)),
      { message: 'Memory text contains forbidden content (secrets, personal data, or credentials)' }
    ),
  sha: z
    .string()
    .min(7, 'SHA must be at least 7 characters')
    .max(40, 'SHA must be at most 40 characters')
    .regex(/^[0-9a-fA-F]+$/, 'SHA must be hexadecimal'),
  repo: MemoryRepoSchema,
  paths: z.array(z.string().min(1)).min(1, 'Must specify at least one path'),
  source: z.string().min(1).max(100),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export interface MemoryReadOptions {
  maxEntries?: number; // K
  maxBytes?: number; // B
  filterStale?: boolean;
  repoPathResolver?: (repo: MemoryRepo) => string;
}

export interface MemoryReadResult {
  entries: (MemoryEntry & { stale?: boolean })[];
  totalStored: number;
  returnedCount: number;
  truncatedBytes: number;
  staleCount: number;
  summary: string;
}
