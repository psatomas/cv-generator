import { type OnePageCvDocument, onePageCvSectionKinds } from "../domain/one-page-cv-document.ts";
import { exportOnePageCvPdf } from "./one-page-cv-pdf-exporter.ts";

export type OnePageCvPdfExporter = (document: OnePageCvDocument) => Promise<Buffer>;

export type CvPdfHttpDependencies = Readonly<{
  exportPdf?: OnePageCvPdfExporter;
}>;

/** Reconstructs only the render-facing document shape accepted by the PDF transport boundary. */
export function parseOnePageCvDocumentRequest(input: unknown): OnePageCvDocument {
  const document = record(input, "document");
  const header = record(document.header, "header");
  const fullName = nonEmptyString(header.fullName, "header.fullName");
  const optionalFields = [
    "professionalTitle",
    "location",
    "email",
    "phone",
    "githubUrl",
    "linkedinUrl",
    "websiteUrl",
  ] as const;
  const parsedHeader: Record<string, string> = { fullName };
  for (const field of optionalFields) {
    const value = header[field];
    if (value !== undefined) {
      parsedHeader[field] = string(value, `header.${field}`);
    }
  }

  const summary = document.summary;
  if (summary !== null && typeof summary !== "string") {
    invalid("summary must be a string or null");
  }
  if (!Array.isArray(document.sections)) {
    invalid("sections must be an array");
  }

  const sections = document.sections.map((item, index) => parseSection(item, index));
  return {
    header: parsedHeader as OnePageCvDocument["header"],
    summary,
    sections,
  };
}

export class InvalidOnePageCvDocumentRequestError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid one-page CV document request: ${issue}`);
    this.name = "InvalidOnePageCvDocumentRequestError";
    this.issue = issue;
  }
}

export async function handleOnePageCvPdfRequest(
  request: Request,
  dependencies: CvPdfHttpDependencies = {},
): Promise<Response> {
  try {
    const document = parseOnePageCvDocumentRequest(await request.json());
    const pdf = await (dependencies.exportPdf ?? exportOnePageCvPdf)(document);
    return new Response(copyBuffer(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${onePageCvPdfFilename(document.header.fullName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof InvalidOnePageCvDocumentRequestError || error instanceof SyntaxError) {
      return json({ error: "Invalid CV document." }, 400);
    }

    return json({ error: "PDF export failed." }, 500);
  }
}

function copyBuffer(pdf: Buffer): ArrayBuffer {
  const bytes = new Uint8Array(pdf.byteLength);
  bytes.set(pdf);
  return bytes.buffer;
}

export function onePageCvPdfFilename(fullName: string): string {
  const stem = fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return stem.length === 0 ? "cv.pdf" : `${stem}-cv.pdf`;
}

function parseSection(input: unknown, index: number): OnePageCvDocument["sections"][number] {
  const section = record(input, `sections[${index}]`);
  if (typeof section.kind !== "string" || !onePageCvSectionKinds.includes(section.kind as never)) {
    invalid(`sections[${index}].kind must be supported`);
  }
  if (!Array.isArray(section.entries) || !section.entries.every((entry) => typeof entry === "string")) {
    invalid(`sections[${index}].entries must be a string array`);
  }

  return {
    kind: section.kind as OnePageCvDocument["sections"][number]["kind"],
    title: string(section.title, `sections[${index}].title`),
    entries: [...section.entries],
  };
}

function record(input: unknown, field: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    invalid(`${field} must be an object`);
  }

  return input as Record<string, unknown>;
}

function nonEmptyString(input: unknown, field: string): string {
  const value = string(input, field);
  if (value.trim().length === 0) {
    invalid(`${field} must be non-empty`);
  }

  return value;
}

function string(input: unknown, field: string): string {
  if (typeof input !== "string") {
    invalid(`${field} must be a string`);
  }

  return input;
}

function invalid(issue: string): never {
  throw new InvalidOnePageCvDocumentRequestError(issue);
}

function json(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
