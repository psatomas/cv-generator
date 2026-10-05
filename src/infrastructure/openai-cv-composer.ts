import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseStatus,
} from "openai/resources/responses/responses";

import {
  cvCompositionEntryKinds,
  type CvComposer,
  type CvCompositionContext,
} from "../application/cv-composition.ts";

export const defaultOpenAICvCompositionModel = "gpt-6-luna";

export const openAICvCompositionInstructions =
  "The supplied context is the complete factual authority for this CV composition. " +
  "Produce concise professional CV wording using only supported claims and their supplied context. " +
  "Every factual summary or entry must include the claim IDs supporting it. " +
  "You may improve phrasing and conservatively combine supported facts, but do not invent or infer " +
  "seniority, duration, employers, project details, metrics, technologies, certifications, achievements, " +
  "qualifications, identity/contact details, or generic assumptions as candidate facts.";

type OpenAIResponse = Pick<Response, "status" | "output_text" | "output">;

export interface OpenAICvResponsesClient {
  responses: {
    create(request: ResponseCreateParamsNonStreaming): Promise<OpenAIResponse>;
  };
}

export type OpenAICvComposerConfig = {
  readonly client: OpenAICvResponsesClient;
  readonly model?: string;
};

export class OpenAICvComposerConfigurationError extends Error {
  constructor(issue: string) {
    super(`OpenAI CV composer configuration error: ${issue}`);
    this.name = "OpenAICvComposerConfigurationError";
  }
}

export class OpenAICvComposerResponseError extends Error {
  constructor(issue: string) {
    super(`OpenAI CV composer response error: ${issue}`);
    this.name = "OpenAICvComposerResponseError";
  }
}

/**
 * OpenAI Responses API adapter. It intentionally returns untrusted structured
 * output for application-level claim-reference validation.
 */
export class OpenAICvComposer implements CvComposer {
  private readonly client: OpenAICvResponsesClient;
  private readonly model: string;

  constructor(config: OpenAICvComposerConfig) {
    this.client = config.client;
    this.model = config.model ?? defaultOpenAICvCompositionModel;
  }

  public async compose(context: CvCompositionContext): Promise<unknown> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: openAICvCompositionInstructions,
      input: JSON.stringify(context),
      text: {
        format: {
          type: "json_schema",
          name: "cv_composition",
          strict: true,
          schema: openAICvCompositionSchema,
        },
      },
    });

    ensureCompleted(response.status, response.output);

    let payload: unknown;
    try {
      payload = JSON.parse(response.output_text);
    } catch {
      throw new OpenAICvComposerResponseError("structured output is not valid JSON");
    }

    if (!isCompositionEnvelope(payload)) {
      throw new OpenAICvComposerResponseError(
        "structured output must contain summary and entries",
      );
    }

    return payload;
  }
}

export function createOpenAICvComposerFromEnvironment(
  config: { readonly apiKey?: string; readonly model?: string } = {},
): OpenAICvComposer {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new OpenAICvComposerConfigurationError("OPENAI_API_KEY is required");
  }

  return new OpenAICvComposer({ client: new OpenAI({ apiKey }), model: config.model });
}

function ensureCompleted(status: ResponseStatus | undefined, output: unknown): void {
  if (status !== "completed") {
    throw new OpenAICvComposerResponseError(
      `response did not complete${status === undefined ? "" : `: ${status}`}`,
    );
  }
  if (containsRefusal(output)) {
    throw new OpenAICvComposerResponseError("response was refused");
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

function isCompositionEnvelope(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "summary" in value &&
    "entries" in value &&
    Array.isArray(value.entries)
  );
}

const factualUnitSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    claimIds: { type: "array", items: { type: "string" } },
  },
  required: ["text", "claimIds"],
  additionalProperties: false,
} as const;

export const openAICvCompositionSchema = {
  type: "object",
  properties: {
    summary: {
      anyOf: [{ type: "null" }, factualUnitSchema],
    },
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { enum: cvCompositionEntryKinds },
          text: { type: "string" },
          claimIds: { type: "array", items: { type: "string" } },
        },
        required: ["kind", "text", "claimIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "entries"],
  additionalProperties: false,
} as const;
