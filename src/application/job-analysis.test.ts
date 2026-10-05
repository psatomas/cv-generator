import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidPersistedCandidateEvidenceError,
  type CandidateEvidenceRepository,
} from "./candidate-evidence-repository.ts";
import {
  InvalidJobDescriptionError,
  JobRequirementExtractorInvocationError,
  type JobRequirementExtractor,
} from "./job-requirement-extraction.ts";
import { analyzeJob } from "./job-analysis.ts";

class InMemoryCandidateEvidenceRepository implements CandidateEvidenceRepository {
  private readonly records: readonly unknown[];

  constructor(records: readonly unknown[]) {
    this.records = records;
  }

  public async list(): Promise<readonly unknown[]> {
    return this.records;
  }

  public async getById(): Promise<unknown | undefined> {
    return undefined;
  }

  public async save(): Promise<void> {
    throw new Error("not used by job analysis");
  }

  public async replace(): Promise<void> {
    throw new Error("not used by job analysis");
  }

  public async delete(): Promise<void> {
    throw new Error("not used by job analysis");
  }
}

class FakeExtractor implements JobRequirementExtractor {
  private readonly result: unknown;

  constructor(result: unknown) {
    this.result = result;
  }

  public async extract(): Promise<unknown> {
    return this.result;
  }
}

const provenance = {
  kind: "candidate-statement",
  statement: "Candidate confirmed this information.",
  recordedOn: "2026-10-04",
} as const;

const evidence = [
  {
    id: "evidence_skill_typescript",
    type: "skill",
    provenance,
    name: "TypeScript",
    level: "advanced",
  },
  {
    id: "evidence_certification_cloud",
    type: "certification",
    provenance,
    name: "Cloud Practitioner",
    issuer: "Cloud Provider",
    awardedOn: "2025-01-01",
  },
] as const;

const requirements = [
  { type: "skill", text: "TypeScript", preference: "required", priority: "high", name: "TypeScript" },
  {
    type: "certification",
    text: "Cloud certification",
    preference: "preferred",
    priority: "medium",
    name: "Cloud Practitioner",
  },
  { type: "skill", text: "Rust", preference: "preferred", priority: "low", name: "Rust" },
  { type: "education", text: "Degree", preference: "required", priority: "medium", qualification: "Degree" },
] as const;

test("orchestrates canonical evidence, requirements, and deterministic matches", async () => {
  const result = await analyzeJob({
    jobDescription: { text: "TypeScript role" },
    evidenceRepository: new InMemoryCandidateEvidenceRepository(evidence),
    extractor: new FakeExtractor(requirements),
  });

  assert.equal(result.source.text, "TypeScript role");
  assert.deepEqual(result.evidence.all().map((item) => item.id), [
    "evidence_skill_typescript",
    "evidence_certification_cloud",
  ]);
  assert.deepEqual(result.requirements.all().map((item) => item.id), [
    "requirement_skill_001",
    "requirement_certification_002",
    "requirement_skill_003",
    "requirement_education_004",
  ]);
  assert.deepEqual(
    result.matches.all().map((match) => [match.requirementId, match.outcome, match.evidenceIds]),
    [
      ["requirement_skill_001", "supported", ["evidence_skill_typescript"]],
      ["requirement_certification_002", "supported", ["evidence_certification_cloud"]],
      ["requirement_skill_003", "unsupported", []],
      ["requirement_education_004", "unsupported", []],
    ],
  );
});

test("propagates extractor and job description failures from the extraction boundary", async () => {
  const repository = new InMemoryCandidateEvidenceRepository(evidence);
  const failingExtractor: JobRequirementExtractor = {
    async extract(): Promise<unknown> {
      throw new Error("provider unavailable");
    },
  };

  await assert.rejects(
    () => analyzeJob({ jobDescription: { text: "Role" }, evidenceRepository: repository, extractor: failingExtractor }),
    (error: unknown) =>
      error instanceof JobRequirementExtractorInvocationError &&
      error.cause instanceof Error &&
      error.cause.message === "provider unavailable",
  );
  await assert.rejects(
    () => analyzeJob({ jobDescription: { text: " " }, evidenceRepository: repository, extractor: new FakeExtractor(requirements) }),
    InvalidJobDescriptionError,
  );
});

test("propagates invalid persisted evidence from the persistence boundary", async () => {
  const repository = new InMemoryCandidateEvidenceRepository([{ ...evidence[0], name: "" }]);

  await assert.rejects(
    () => analyzeJob({ jobDescription: { text: "Role" }, evidenceRepository: repository, extractor: new FakeExtractor(requirements) }),
    InvalidPersistedCandidateEvidenceError,
  );
});
