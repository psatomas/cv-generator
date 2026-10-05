import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { saveCandidateProfile } from "../application/candidate-profile-repository.ts";
import { CvCompositionValidationError } from "../application/cv-composition.ts";
import { CandidateProfileRequiredError } from "../application/one-page-cv-generation.ts";
import { parseCandidateEvidence } from "../domain/candidate-evidence.ts";
import {
  defaultOpenAICvCompositionModel,
  type OpenAICvResponsesClient,
} from "./openai-cv-composer.ts";
import {
  CvGenerationBootstrapConfigurationError,
  createCvGenerationRuntime,
  createCvGenerationRuntimeFromEnvironment,
  type CvGenerationOpenAIResponsesClient,
} from "./cv-generation-runtime.ts";
import {
  defaultOpenAIJobRequirementExtractionModel,
  type OpenAIResponsesClient,
} from "./openai-job-requirement-extractor.ts";
import { SqliteCandidateEvidenceRepository } from "./sqlite-candidate-evidence-repository.ts";
import { SqliteCandidateProfileRepository } from "./sqlite-candidate-profile-repository.ts";

type Request = Parameters<OpenAIResponsesClient["responses"]["create"]>[0];

class FakeOpenAIClient implements CvGenerationOpenAIResponsesClient {
  public readonly requests: Request[] = [];
  private readonly responsesToReturn: readonly unknown[];

  constructor(responsesToReturn: readonly unknown[]) {
    this.responsesToReturn = responsesToReturn;
  }

  public readonly responses = {
    create: async (request: Request) => {
      this.requests.push(request);
      const response = this.responsesToReturn[this.requests.length - 1];
      if (response === undefined) {
        throw new Error("unexpected OpenAI request");
      }

      return response as Awaited<ReturnType<OpenAICvResponsesClient["responses"]["create"]>>;
    },
  };
}

const provenance = {
  kind: "candidate-statement",
  statement: "Candidate confirmed this information.",
  recordedOn: "2026-10-04",
} as const;

function completedResponse(output: unknown): unknown {
  return { status: "completed", output: [], output_text: JSON.stringify(output) };
}

async function saveEvidence(database: Database.Database): Promise<void> {
  const repository = new SqliteCandidateEvidenceRepository(database);
  await repository.save(parseCandidateEvidence({
    id: "evidence_skill_typescript",
    type: "skill",
    provenance,
    name: "TypeScript",
    level: "advanced",
  }));
  await repository.save(parseCandidateEvidence({
    id: "evidence_project_unrelated",
    type: "project",
    provenance,
    name: "Unrelated Project",
    technologies: ["TypeScript"],
    highlights: ["Implemented an unrelated project."],
  }));
}

async function saveProfile(database: Database.Database): Promise<void> {
  await saveCandidateProfile(new SqliteCandidateProfileRepository(database), {
    fullName: "Alex Example",
    professionalTitle: "Protocol Engineer",
    location: "Recife, Brazil",
  });
}

test("wires real SQLite storage and both OpenAI adapters into the canonical workflow", async () => {
  const database = new Database(":memory:");
  await saveEvidence(database);
  const client = new FakeOpenAIClient([
    completedResponse({
      requirements: [
        { type: "skill", text: "TypeScript", preference: "required", priority: "high", name: "TypeScript" },
        { type: "skill", text: "Rust", preference: "preferred", priority: "low", name: "Rust" },
      ],
    }),
    completedResponse({
      summary: { text: "TypeScript", claimIds: ["claim_skill_001"] },
      entries: [{ kind: "skill", text: "TypeScript", claimIds: ["claim_skill_001"] }],
    }),
  ]);
  const runtime = createCvGenerationRuntime({ database, openAIClient: client });

  const result = await runtime.generate({ text: "Need TypeScript and Rust." });

  assert.equal(result.source.text, "Need TypeScript and Rust.");
  assert.deepEqual(result.evidence.all().map((item) => item.id), [
    "evidence_skill_typescript",
    "evidence_project_unrelated",
  ]);
  assert.deepEqual(result.requirements.all().map((item) => item.id), [
    "requirement_skill_001",
    "requirement_skill_002",
  ]);
  assert.deepEqual(result.matches.all().map((match) => match.outcome), ["supported", "unsupported"]);
  assert.deepEqual(result.claims.all().map((claim) => claim.id), ["claim_skill_001"]);
  assert.deepEqual(result.composition, {
    summary: { text: "TypeScript", claimIds: ["claim_skill_001"] },
    entries: [{ kind: "skill", text: "TypeScript", claimIds: ["claim_skill_001"] }],
  });
  assert.equal(client.requests[0].model, defaultOpenAIJobRequirementExtractionModel);
  assert.equal(client.requests[1].model, defaultOpenAICvCompositionModel);
  assert.equal((client.requests[1].input as string).includes("evidence_project_unrelated"), false);
  database.close();
});

test("forwards independent model overrides and leaves workflow failures unchanged", async () => {
  const database = new Database(":memory:");
  await saveEvidence(database);
  const client = new FakeOpenAIClient([
    completedResponse({
      requirements: [
        { type: "skill", text: "TypeScript", preference: "required", priority: "high", name: "TypeScript" },
      ],
    }),
    completedResponse({
      summary: null,
      entries: [{ kind: "skill", text: "TypeScript", claimIds: ["claim_unknown"] }],
    }),
  ]);
  const runtime = createCvGenerationRuntime({
    database,
    openAIClient: client,
    requirementModel: "requirement-model",
    compositionModel: "composition-model",
  });

  await assert.rejects(
    () => runtime.generate({ text: "Need TypeScript" }),
    CvCompositionValidationError,
  );
  assert.equal(client.requests[0].model, "requirement-model");
  assert.equal(client.requests[1].model, "composition-model");
  database.close();
});

test("wires persisted profile, evidence, and OpenAI adapters into final one-page generation", async () => {
  const database = new Database(":memory:");
  await saveProfile(database);
  await saveEvidence(database);
  const client = new FakeOpenAIClient([
    completedResponse({
      requirements: [
        { type: "skill", text: "TypeScript", preference: "required", priority: "high", name: "TypeScript" },
      ],
    }),
    completedResponse({
      summary: { text: "TypeScript", claimIds: ["claim_skill_001"] },
      entries: [{ kind: "skill", text: "TypeScript", claimIds: ["claim_skill_001"] }],
    }),
  ]);
  const runtime = createCvGenerationRuntime({
    database,
    openAIClient: client,
    requirementModel: "requirements-test-model",
    compositionModel: "composition-test-model",
  });

  const result = await runtime.generateOnePage({ text: "Need TypeScript." });

  assert.equal(result.profile.fullName, "Alex Example");
  assert.equal(result.evidence.all()[0].id, "evidence_skill_typescript");
  assert.equal(result.requirements.all()[0].id, "requirement_skill_001");
  assert.equal(result.matches.all()[0].outcome, "supported");
  assert.equal(result.claims.all()[0].id, "claim_skill_001");
  assert.equal(result.composition.summary?.claimIds[0], "claim_skill_001");
  assert.deepEqual(result.document, {
    header: {
      fullName: "Alex Example",
      professionalTitle: "Protocol Engineer",
      location: "Recife, Brazil",
    },
    summary: "TypeScript",
    sections: [{ kind: "skills", title: "Skills", entries: ["TypeScript"] }],
  });
  const document = JSON.stringify(result.document);
  assert.equal(document.includes("claimIds"), false);
  assert.equal(document.includes("evidence_"), false);
  assert.equal(document.includes("requirement_"), false);
  assert.equal(client.requests[0].model, "requirements-test-model");
  assert.equal(client.requests[1].model, "composition-test-model");
  assert.equal((client.requests[1].input as string).includes("evidence_project_unrelated"), false);
  database.close();
});

test("propagates a missing profile before any OpenAI request", async () => {
  const database = new Database(":memory:");
  await saveEvidence(database);
  const client = new FakeOpenAIClient([]);
  const runtime = createCvGenerationRuntime({ database, openAIClient: client });

  await assert.rejects(
    () => runtime.generateOnePage({ text: "Need TypeScript." }),
    CandidateProfileRequiredError,
  );
  assert.deepEqual(client.requests, []);
  database.close();
});

test("returns a profile header with an empty document body when no claims are supported", async () => {
  const database = new Database(":memory:");
  await saveProfile(database);
  await saveEvidence(database);
  const client = new FakeOpenAIClient([
    completedResponse({
      requirements: [
        { type: "skill", text: "Rust", preference: "required", priority: "high", name: "Rust" },
      ],
    }),
  ]);
  const runtime = createCvGenerationRuntime({ database, openAIClient: client });

  const result = await runtime.generateOnePage({ text: "Need Rust." });

  assert.deepEqual(result.composition, { summary: null, entries: [] });
  assert.deepEqual(result.document, {
    header: {
      fullName: "Alex Example",
      professionalTitle: "Protocol Engineer",
      location: "Recife, Brazil",
    },
    summary: null,
    sections: [],
  });
  assert.equal(client.requests.length, 1);
  database.close();
});

test("validates environment configuration and owns only its helper-created database", () => {
  assert.throws(
    () => createCvGenerationRuntimeFromEnvironment({ apiKey: "key", environment: {} }),
    (error: unknown) =>
      error instanceof CvGenerationBootstrapConfigurationError &&
      error.issue === "CV_GENERATOR_DATABASE_PATH is required",
  );
  assert.throws(
    () => createCvGenerationRuntimeFromEnvironment({ databasePath: ":memory:", environment: {} }),
    (error: unknown) =>
      error instanceof CvGenerationBootstrapConfigurationError &&
      error.issue === "OPENAI_API_KEY is required",
  );

  const runtime = createCvGenerationRuntimeFromEnvironment({
    environment: {
      CV_GENERATOR_DATABASE_PATH: ":memory:",
      OPENAI_API_KEY: "test-key",
    },
  });
  assert.equal(typeof runtime.generate, "function");
  assert.equal(typeof runtime.generateOnePage, "function");
  runtime.close();
});
