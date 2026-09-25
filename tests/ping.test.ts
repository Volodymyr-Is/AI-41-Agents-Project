import { describe, expect, it } from 'vitest';

import { GET } from '../app/api/ping/route';
import { PingResponse } from '../src/ping';

describe('GET /api/ping', () => {
  it('returns 200 and a response matching PingResponse', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(PingResponse.safeParse(await response.json()).success).toBe(true);
  });
});
