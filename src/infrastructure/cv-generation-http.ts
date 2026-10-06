import {
  CandidateProfileRequiredError,
  type OnePageCvGenerationResult,
} from "../application/one-page-cv-generation.ts";
import { type JobDescription } from "../application/job-requirement-extraction.ts";
import {
  createCvGenerationRuntimeFromEnvironment,
  CvGenerationBootstrapConfigurationError,
} from "./cv-generation-runtime.ts";

export type OnePageCvGenerationRuntime = Readonly<{
  generateOnePage(jobDescription: JobDescription): Promise<Pick<OnePageCvGenerationResult, "document">>;
  close(): void;
}>;

export type CvGenerationRuntimeFactory = () => OnePageCvGenerationRuntime;

export type CvGenerationHttpDependencies = Readonly<{
  createRuntime?: CvGenerationRuntimeFactory;
}>;

/** Validates the small public transport input without changing canonical job-description rules. */
export function parseJobDescriptionRequest(input: unknown): JobDescription {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvalidCvGenerationRequestError();
  }

  const { jobDescription } = input as Record<string, unknown>;
  if (typeof jobDescription !== "string" || jobDescription.trim().length === 0) {
    throw new InvalidCvGenerationRequestError();
  }

  return Object.freeze({ text: jobDescription });
}

export class InvalidCvGenerationRequestError extends Error {
  constructor() {
    super("Job description must be a non-empty string");
    this.name = "InvalidCvGenerationRequestError";
  }
}

/** Handles the public transport boundary while keeping concrete runtime creation injectable for tests. */
export async function handleCvGenerationRequest(
  request: Request,
  dependencies: CvGenerationHttpDependencies = {},
): Promise<Response> {
  let runtime: OnePageCvGenerationRuntime | undefined;

  try {
    const jobDescription = parseJobDescriptionRequest(await request.json());
    runtime = (dependencies.createRuntime ?? createCvGenerationRuntimeFromEnvironment)();
    const result = await runtime.generateOnePage(jobDescription);
    return json({ document: result.document });
  } catch (error) {
    return generationErrorResponse(error);
  } finally {
    runtime?.close();
  }
}

function generationErrorResponse(error: unknown): Response {
  if (error instanceof InvalidCvGenerationRequestError || error instanceof SyntaxError) {
    return json({ error: "Job description must be a non-empty string." }, 400);
  }
  if (error instanceof CandidateProfileRequiredError) {
    return json({ error: "Candidate profile is not configured." }, 422);
  }
  if (error instanceof CvGenerationBootstrapConfigurationError) {
    return json({ error: "CV generation is not configured." }, 500);
  }

  return json({ error: "CV generation failed." }, 502);
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export type GeneratedDocumentResponse = Pick<OnePageCvGenerationResult, "document">;
