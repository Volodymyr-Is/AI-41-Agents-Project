import { PingResponse, type PingResponse as PingResponseData } from '../../../src/ping';

export async function GET(): Promise<Response> {
  const data: PingResponseData = PingResponse.parse({ status: 'ok' });

  return Response.json(data);
}
