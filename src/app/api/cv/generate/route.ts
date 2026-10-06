import { handleCvGenerationRequest } from "../../../../infrastructure/cv-generation-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleCvGenerationRequest(request);
}
