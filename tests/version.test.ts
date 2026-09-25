import { describe, expect, it } from 'vitest';

import { GET } from '../app/api/version/route';
import { VersionResponse } from '../src/version';

describe('GET /api/version', () => {
  it('returns 200 and a response matching VersionResponse', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const json = await response.json();
    expect(VersionResponse.safeParse(json).success).toBe(true);
    expect(json).toEqual({ version: '1.0.0' });
  });
});
