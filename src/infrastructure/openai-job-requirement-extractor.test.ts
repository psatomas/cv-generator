import assert from "node:assert/strict";
import test from "node:test";

import {
  JobRequirementExtractorInvocationError,
  extractJobRequirements,
} from "../application/job-requirement-extraction.ts";
import {
  OpenAIJobRequirementExtractor,
  OpenAIJobRequirementExtractorConfigurationError,
  OpenAIJobRequirementExtractorResponseError,
  createOpenAIJobRequirementExtractorFromEnvironment,
  defaultOpenAIJobRequirementExtractionModel,
  jobRequirementExtractionSchema,
  type OpenAIResponsesClient,
} from "./openai-job-requirement-extractor.ts";

type Request = Parameters<OpenAIResponsesClient["responses"]["create"]>[0];

class FakeOpenAIClient implements OpenAIResponsesClient {
  public readonly requests: Request[] = [];
  private readonly response: unknown;

  constructor(response: unknown) {
    this.response = response;
  }

  public readonly responses = {
    create: async (request: Request) => {
      this.requests.push(request);
      return this.response as Awaited<ReturnType<OpenAIResponsesClient["responses"]["create"]>>;
    },
  };
}

const candidates = [
  { type: "skill", text: "TypeScript", preference: "required", priority: "high", name: "TypeScript" },
  {
    type: "experience",
    text: "Backend experience",
    preference: "required",
    priority: "medium",
    area: "Backend engineering",
    minimumYears: 3,
  },
  { type: "education", text: "Degree", preference: "preferred", priority: "low", qualification: "Degree" },
  { type: "certification", text: "Cloud certificate", preference: "preferred", priority: "low", name: "Cloud" },
  { type: "responsibility", text: "Lead delivery", preference: "required", priority: "high" },
  { type: "domain-knowledge", text: "Fintech", preference: "preferred", priority: "low", topic: "Fintech" },
  { type: "language", text: "English", preference: "required", priority: "medium", language: "English", proficiency: null },
  {
    type: "location-work-arrangement",
    text: "Remote in Brazil",
    preference: "required",
    priority: "medium",
    location: "Brazil",
    arrangement: "remote",
  },
];

function completedResponse(requirements: unknown = candidates): unknown {
  return { status: "completed", output: [], output_text: JSON.stringify({ requirements }) };
}

test("uses Responses structured output with the default model and returns untrusted ordered candidates", async () => {
  const client = new FakeOpenAIClient(completedResponse());
  const extractor = new OpenAIJobRequirementExtractor({ client });

  const output = await extractor.extract({ text: "Build backend services." });

  assert.deepEqual(output, candidates);
  assert.equal(client.requests.length, 1);
  const request = client.requests[0];
  assert.equal(request.model, defaultOpenAIJobRequirementExtractionModel);
  assert.equal(request.input, "Build backend services.");
  assert.match(request.instructions ?? "", /extract only explicit job requirements/i);
  const format = request.text?.format;
  assert.ok(format && format.type === "json_schema");
  assert.equal(format.strict, true);
  assert.equal(format.name, "job_requirement_extraction");
  assert.equal("id" in (output as Record<string, unknown>[])[0], false);
  assert.equal((output as Record<string, unknown>[])[6].proficiency, null);
});

test("uses an explicit model override", async () => {
  const client = new FakeOpenAIClient(completedResponse([]));
  const extractor = new OpenAIJobRequirementExtractor({ client, model: "gpt-6-luna-custom" });

  assert.deepEqual(await extractor.extract({ text: "Role" }), []);
  assert.equal(client.requests[0].model, "gpt-6-luna-custom");
});

test("represents every requirement variant in the strict provider schema", () => {
  const variants = jobRequirementExtractionSchema.properties.requirements.items.oneOf as unknown as readonly {
    properties: { type: { const: string } };
  }[];

  assert.deepEqual(
    variants.map((variant) => variant.properties.type.const),
    [
      "skill",
      "experience",
      "education",
      "certification",
      "responsibility",
      "domain-knowledge",
      "language",
      "location-work-arrangement",
    ],
  );
  assert.equal(jobRequirementExtractionSchema.additionalProperties, false);
});

test("rejects incomplete, refused, malformed, and missing provider output deterministically", async () => {
  await assert.rejects(
    () => new OpenAIJobRequirementExtractor({ client: new FakeOpenAIClient({ status: "incomplete", output: [], output_text: "" }) }).extract({ text: "Role" }),
    (error: unknown) => error instanceof OpenAIJobRequirementExtractorResponseError && error.message.endsWith("incomplete"),
  );
  await assert.rejects(
    () => new OpenAIJobRequirementExtractor({ client: new FakeOpenAIClient({ status: "completed", output: [{ content: [{ type: "refusal" }] }], output_text: "" }) }).extract({ text: "Role" }),
    (error: unknown) => error instanceof OpenAIJobRequirementExtractorResponseError && error.message.endsWith("refused"),
  );
  await assert.rejects(
    () => new OpenAIJobRequirementExtractor({ client: new FakeOpenAIClient({ status: "completed", output: [], output_text: "not json" }) }).extract({ text: "Role" }),
    OpenAIJobRequirementExtractorResponseError,
  );
  await assert.rejects(
    () => new OpenAIJobRequirementExtractor({ client: new FakeOpenAIClient({ status: "completed", output: [], output_text: "{}" }) }).extract({ text: "Role" }),
    OpenAIJobRequirementExtractorResponseError,
  );
});

test("propagates provider failures to the existing application extraction boundary", async () => {
  const client: OpenAIResponsesClient = {
    responses: {
      async create(): Promise<never> {
        throw new Error("rate limited");
      },
    },
  };

  await assert.rejects(
    () => extractJobRequirements({ jobDescription: { text: "Role" }, extractor: new OpenAIJobRequirementExtractor({ client }) }),
    (error: unknown) =>
      error instanceof JobRequirementExtractorInvocationError &&
      error.cause instanceof Error &&
      error.cause.message === "rate limited",
  );
});

test("works end-to-end while the application boundary owns IDs and domain validation", async () => {
  const extractor = new OpenAIJobRequirementExtractor({ client: new FakeOpenAIClient(completedResponse([candidates[0]])) });
  const result = await extractJobRequirements({ jobDescription: { text: "Need TypeScript" }, extractor });

  assert.equal(result.requirements.all()[0].id, "requirement_skill_001");
  assert.equal(result.requirements.all()[0].type, "skill");
});

test("fails clearly when environment configuration has no API key", () => {
  assert.throws(
    () => createOpenAIJobRequirementExtractorFromEnvironment({ apiKey: " " }),
    OpenAIJobRequirementExtractorConfigurationError,
  );
});
