import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseStatus,
} from "openai/resources/responses/responses";

import type {
  JobDescription,
  JobRequirementExtractor,
} from "../application/job-requirement-extraction.ts";

export const defaultOpenAIJobRequirementExtractionModel = "gpt-6-luna";

export const openAIJobRequirementExtractionInstructions =
  "Extract only explicit job requirements from the supplied job description. " +
  "Do not invent qualifications or semantically enrich the source. Preserve meaningful source order. " +
  "Use only the provided requirement types. Mark requirements required or preferred only when " +
  "supported by the wording, and assign priority conservatively. Preserve source meaning in text. " +
  "Populate subtype fields only when supported by the job description. Return no candidate IDs. " +
  "Do not evaluate any candidate or profile.";

type OpenAIResponse = Pick<Response, "status" | "output_text" | "output">;

export interface OpenAIResponsesClient {
  responses: {
    create(request: ResponseCreateParamsNonStreaming): Promise<OpenAIResponse>;
  };
}

export type OpenAIJobRequirementExtractorConfig = {
  readonly client: OpenAIResponsesClient;
  readonly model?: string;
};

export class OpenAIJobRequirementExtractorConfigurationError extends Error {
  constructor(issue: string) {
    super(`OpenAI job requirement extractor configuration error: ${issue}`);
    this.name = "OpenAIJobRequirementExtractorConfigurationError";
  }
}

export class OpenAIJobRequirementExtractorResponseError extends Error {
  constructor(issue: string) {
    super(`OpenAI job requirement extractor response error: ${issue}`);
    this.name = "OpenAIJobRequirementExtractorResponseError";
  }
}

/**
 * OpenAI Responses API adapter. Output is intentionally left untrusted for the
 * application boundary to canonicalize and validate.
 */
export class OpenAIJobRequirementExtractor implements JobRequirementExtractor {
  private readonly client: OpenAIResponsesClient;
  private readonly model: string;

  constructor(config: OpenAIJobRequirementExtractorConfig) {
    this.client = config.client;
    this.model = config.model ?? defaultOpenAIJobRequirementExtractionModel;
  }

  public async extract(jobDescription: JobDescription): Promise<unknown> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: openAIJobRequirementExtractionInstructions,
      input: jobDescription.text,
      text: {
        format: {
          type: "json_schema",
          name: "job_requirement_extraction",
          strict: true,
          schema: jobRequirementExtractionSchema,
        },
      },
    });

    ensureCompleted(response.status, response.output);

    let payload: unknown;
    try {
      payload = JSON.parse(response.output_text);
    } catch {
      throw new OpenAIJobRequirementExtractorResponseError("structured output is not valid JSON");
    }

    if (!isRequirementEnvelope(payload)) {
      throw new OpenAIJobRequirementExtractorResponseError(
        "structured output must contain a requirements array",
      );
    }

    return payload.requirements;
  }
}

export function createOpenAIJobRequirementExtractorFromEnvironment(
  config: { readonly apiKey?: string; readonly model?: string } = {},
): OpenAIJobRequirementExtractor {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new OpenAIJobRequirementExtractorConfigurationError("OPENAI_API_KEY is required");
  }

  return new OpenAIJobRequirementExtractor({
    client: new OpenAI({ apiKey }),
    model: config.model,
  });
}

function ensureCompleted(status: ResponseStatus | undefined, output: unknown): void {
  if (status !== "completed") {
    throw new OpenAIJobRequirementExtractorResponseError(
      `response did not complete${status === undefined ? "" : `: ${status}`}`,
    );
  }

  if (containsRefusal(output)) {
    throw new OpenAIJobRequirementExtractorResponseError("response was refused");
  }
}

function containsRefusal(output: unknown): boolean {
  if (!Array.isArray(output)) {
    return false;
  }

  return output.some(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "content" in item &&
      Array.isArray((item as { content: unknown }).content) &&
      ((item as { content: unknown[] }).content).some(
        (content) =>
          typeof content === "object" && content !== null && "type" in content && content.type === "refusal",
      ),
  );
}

function isRequirementEnvelope(value: unknown): value is { requirements: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "requirements" in value &&
    Array.isArray(value.requirements)
  );
}

const baseProperties = {
  type: { type: "string" },
  text: { type: "string" },
  preference: { enum: ["required", "preferred"] },
  priority: { enum: ["low", "medium", "high", "critical"] },
} as const;

function requirementVariant(
  type: string,
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> {
  return {
    type: "object",
    properties: { ...baseProperties, type: { const: type }, ...properties },
    required: ["type", "text", "preference", "priority", ...required],
    additionalProperties: false,
  };
}

export const jobRequirementExtractionSchema = {
  type: "object",
  properties: {
    requirements: {
      type: "array",
      items: {
        oneOf: [
          requirementVariant("skill", { name: { type: "string" } }, ["name"]),
          requirementVariant(
            "experience",
            { area: { type: "string" }, minimumYears: { type: ["integer", "null"] } },
            ["area", "minimumYears"],
          ),
          requirementVariant("education", { qualification: { type: "string" } }, ["qualification"]),
          requirementVariant("certification", { name: { type: "string" } }, ["name"]),
          requirementVariant("responsibility", {}, []),
          requirementVariant("domain-knowledge", { topic: { type: "string" } }, ["topic"]),
          requirementVariant(
            "language",
            {
              language: { type: "string" },
              proficiency: { enum: ["basic", "professional", "fluent", "native", null] },
            },
            ["language", "proficiency"],
          ),
          requirementVariant(
            "location-work-arrangement",
            {
              location: { type: ["string", "null"] },
              arrangement: { enum: ["remote", "hybrid", "onsite", null] },
            },
            ["location", "arrangement"],
          ),
        ],
      },
    },
  },
  required: ["requirements"],
  additionalProperties: false,
} as const;
