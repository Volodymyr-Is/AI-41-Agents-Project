import { z } from 'zod';

export const PingResponse = z.object({
  status: z.literal('ok'),
});

export type PingResponse = z.infer<typeof PingResponse>;
