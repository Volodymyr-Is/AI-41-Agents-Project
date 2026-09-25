import { HealthResponse } from '../../../src/health';

export function GET(): Response {
  const body = HealthResponse.parse({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });

  return Response.json(body);
}
