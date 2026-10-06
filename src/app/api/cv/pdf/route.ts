import { handleOnePageCvPdfRequest } from "../../../../infrastructure/cv-pdf-http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleOnePageCvPdfRequest(request);
}
