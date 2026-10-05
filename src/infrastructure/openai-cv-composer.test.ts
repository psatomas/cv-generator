import assert from "node:assert/strict";
import test from "node:test";

import {
  CvComposerInvocationError,
  CvCompositionValidationError,
  composeCv,
  type CvCompositionContext,
} from "../application/cv-composition.ts";
import { createCandidateEvidenceCollection } from "../domain/candidate-evidence-collection.ts";
import { createJobRequirementCollection } from "../domain/job-requirement-collection.ts";
import { createSupportedClaimCollection } from "../domain/supported-claim-collection.ts";
import {
  OpenAICvComposer,
  OpenAICvComposerConfigurationError,
  OpenAICvComposerResponseError,
  createOpenAICvComposerFromEnvironment,
  defaultOpenAICvCompositionModel,
  openAICvCompositionSchema,
  type OpenAICvResponsesClient,
} from "./openai-cv-composer.ts";

type Request = Parameters<OpenAICvResponsesClient["responses"]["create"]>[0];

class FakeOpenAIClient implements OpenAICvResponsesClient {
  public readonly requests: Request[] = [];
  private readonly response: unknown;

  constructor(response: unknown) {
    this.response = response;
  }

  public readonly responses = {
    create: async (request: Request) => {
      this.requests.push(request);
      return this.response as Awaited<ReturnType<OpenAICvResponsesClient["responses"]["create"]>>;
    },
  };
}

const provenance = {
  kind: "candidate-statement",
  statement: "Candidate confirmed this information.",
  recordedOn: "2026-10-04",
} as const;

const evidence = createCandidateEvidenceCollection([
  { id: "evidence_skill_typescript", type: "skill", provenance, name: "TypeScript", level: "advanced" },
  {
    id: "evidence_project_unrelated",
    type: "project",
    provenance,
    name: "Unrelated Project",
    technologies: ["TypeScript"],
    highlights: ["Implemented an unrelated project."],
  },
]);

const requirements = createJobRequirementCollection([
  {
    id: "requirement_skill_typescript",
    type: "skill",
    text: "TypeScript",
    preference: "required",
    priority: "high",
    name: "TypeScript",
  },
]);

const claims = createSupportedClaimCollection({
  evidence,
  requirements,
  claims: [
    {
      id: "claim_skill_typescript",
      text: "TypeScript",
      requirementId: "requirement_skill_typescript",
      evidenceIds: ["evidence_skill_typescript"],
    },
  ],
});

const context: CvCompositionContext = {
  claims: [
    {
      claim: claims.all()[0],
      requirement: requirements.all()[0],
      evidence: [evidence.all()[0]],
    },
  ],
};

const composition = {
  summary: { text: "TypeScript", claimIds: ["claim_skill_typescript"] },
  entries: [{ kind: "skill", text: "TypeScript", claimIds: ["claim_skill_typescript"] }],
};

function completedResponse(output: unknown = composition): unknown {
  return { status: "completed", output: [], output_text: JSON.stringify(output) };
}

test("uses Responses structured output with default model and only the supplied context", async () => {
  const client = new FakeOpenAIClient(completedResponse());
  const composer = new OpenAICvComposer({ client });

  assert.deepEqual(await composer.compose(context), composition);
  const request = client.requests[0];
  assert.equal(request.model, defaultOpenAICvCompositionModel);
  assert.match(request.instructions ?? "", /complete factual authority/i);
  const format = request.text?.format;
  assert.ok(format && format.type === "json_schema");
  assert.equal(format.strict, true);
  assert.equal(format.name, "cv_composition");
  assert.deepEqual(JSON.parse(request.input as string), context);
  assert.equal((request.input as string).includes("evidence_project_unrelated"), false);
});

test("supports model override and null-summary structured output", async () => {
  const client = new FakeOpenAIClient(completedResponse({ summary: null, entries: composition.entries }));
  const composer = new OpenAICvComposer({ client, model: "gpt-6-luna-custom" });

  assert.deepEqual(await composer.compose(context), { summary: null, entries: composition.entries });
  assert.equal(client.requests[0].model, "gpt-6-luna-custom");
});

test("uses schema variants and entry kinds required by the application shape", () => {
  const summary = openAICvCompositionSchema.properties.summary as unknown as { anyOf: readonly unknown[] };
  const kinds = openAICvCompositionSchema.properties.entries.items.properties.kind as unknown as {
    enum: readonly string[];
  };

  assert.equal(summary.anyOf.length, 2);
  assert.deepEqual(kinds.enum, ["skill", "certification", "statement"]);
  assert.deepEqual(openAICvCompositionSchema.required, ["summary", "entries"]);
});

test("rejects incomplete, refused, malformed, and missing composition output", async () => {
  await assert.rejects(
    () => new OpenAICvComposer({ client: new FakeOpenAIClient({ status: "incomplete", output: [], output_text: "" }) }).compose(context),
    OpenAICvComposerResponseError,
  );
  await assert.rejects(
    () => new OpenAICvComposer({ client: new FakeOpenAIClient({ status: "completed", output: [{ content: [{ type: "refusal" }] }], output_text: "" }) }).compose(context),
    OpenAICvComposerResponseError,
  );
  await assert.rejects(
    () => new OpenAICvComposer({ client: new FakeOpenAIClient({ status: "completed", output: [], output_text: "not json" }) }).compose(context),
    OpenAICvComposerResponseError,
  );
  await assert.rejects(
    () => new OpenAICvComposer({ client: new FakeOpenAIClient({ status: "completed", output: [], output_text: "{}" }) }).compose(context),
    OpenAICvComposerResponseError,
  );
});

test("leaves provider errors for the application boundary and claim validation", async () => {
  const failingClient: OpenAICvResponsesClient = {
    responses: {
      async create(): Promise<never> {
        throw new Error("rate limited");
      },
    },
  };
  await assert.rejects(
    () => composeCv({ claims, evidence, requirements, composer: new OpenAICvComposer({ client: failingClient }) }),
    (error: unknown) =>
      error instanceof CvComposerInvocationError &&
      error.cause instanceof Error &&
      error.cause.message === "rate limited",
  );

  const composer = new OpenAICvComposer({
    client: new FakeOpenAIClient(completedResponse({
      summary: null,
      entries: [{ kind: "skill", text: "TypeScript", claimIds: ["claim_unknown"] }],
    })),
  });
  await assert.rejects(
    () => composeCv({ claims, evidence, requirements, composer }),
    CvCompositionValidationError,
  );
});

test("fails clearly when API key configuration is absent", () => {
  assert.throws(
    () => createOpenAICvComposerFromEnvironment({ apiKey: " " }),
    OpenAICvComposerConfigurationError,
  );
});
