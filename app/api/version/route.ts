import { VersionResponse, type VersionResponse as VersionResponseData } from '../../../src/version';

export async function GET(): Promise<Response> {
  const data: VersionResponseData = VersionResponse.parse({ version: '1.0.0' });

  return Response.json(data);
}
