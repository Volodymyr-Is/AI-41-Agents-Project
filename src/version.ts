import { z } from 'zod';

export const VersionResponse = z.object({
  version: z.literal('1.0.0'),
});

export type VersionResponse = z.infer<typeof VersionResponse>;
