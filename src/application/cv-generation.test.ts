import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidPersistedCandidateEvidenceError,
  type CandidateEvidenceRepository,
} from "./candidate-evidence-repository.ts";
import {
  CvComposerInvocationError,
  CvCompositionValidationError,
  type CvComposer,
  type CvCompositionContext,
} from "./cv-composition.ts";
import { generateCvForJob } from "./cv-generation.ts";
import {
  JobRequirementExtractorInvocationError,
  type JobRequirementExtractor,
} from "./job-requirement-extraction.ts";

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
    throw new Error("not used by CV generation");
  }

  public async replace(): Promise<void> {
    throw new Error("not used by CV generation");
  }

  public async delete(): Promise<void> {
    throw new Error("not used by CV generation");
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

class FakeComposer implements CvComposer {
  public readonly contexts: CvCompositionContext[] = [];
  private readonly result: unknown;

  constructor(result: unknown) {
    this.result = result;
  }

  public async compose(context: CvCompositionContext): Promise<unknown> {
    this.contexts.push(context);
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
    issuer: "Example Cloud",
    awardedOn: "2024-04-30",
  },
  {
    id: "evidence_project_unrelated",
    type: "project",
    provenance,
    name: "Unrelated Project",
    technologies: ["TypeScript"],
    highlights: ["Implemented an unrelated project."],
  },
] as const;

const requirements = [
  { type: "skill", text: "TypeScript", preference: "required", priority: "high", name: "TypeScript" },
  {
    type: "certification",
    text: "Cloud Practitioner certification",
    preference: "preferred",
    priority: "medium",
    name: "Cloud Practitioner",
  },
  { type: "skill", text: "Rust", preference: "preferred", priority: "low", name: "Rust" },
] as const;

const validComposition = {
  summary: { text: "TypeScript and cloud certified.", claimIds: ["claim_skill_001"] },
  entries: [
    { kind: "skill", text: "TypeScript", claimIds: ["claim_skill_001"] },
    { kind: "certification", text: "Cloud Practitioner", claimIds: ["claim_certification_002"] },
  ],
};

test("orchestrates canonical job analysis, claims, and grounded CV composition", async () => {
  const composer = new FakeComposer(validComposition);
  const result = await generateCvForJob({
    jobDescription: { text: "TypeScript role" },
    evidenceRepository: new InMemoryCandidateEvidenceRepository(evidence),
    extractor: new FakeExtractor(requirements),
    composer,
  });

  assert.equal(result.source.text, "TypeScript role");
  assert.deepEqual(result.evidence.all().map((item) => item.id), [
    "evidence_skill_typescript",
    "evidence_certification_cloud",
    "evidence_project_unrelated",
  ]);
  assert.deepEqual(result.requirements.all().map((item) => item.id), [
    "requirement_skill_001",
    "requirement_certification_002",
    "requirement_skill_003",
  ]);
  assert.deepEqual(result.matches.all().map((match) => [match.requirementId, match.outcome]), [
    ["requirement_skill_001", "supported"],
    ["requirement_certification_002", "supported"],
    ["requirement_skill_003", "unsupported"],
  ]);
  assert.deepEqual(result.claims.all().map((claim) => claim.id), [
    "claim_skill_001",
    "claim_certification_002",
  ]);
  assert.deepEqual(result.composition, validComposition);

  assert.equal(composer.contexts.length, 1);
  assert.deepEqual(composer.contexts[0].claims.map((item) => item.claim.id), [
    "claim_skill_001",
    "claim_certification_002",
  ]);
  assert.deepEqual(composer.contexts[0].claims.map((item) => item.requirement.id), [
    "requirement_skill_001",
    "requirement_certification_002",
  ]);
  assert.deepEqual(composer.contexts[0].claims.map((item) => item.evidence.map((value) => value.id)), [
    ["evidence_skill_typescript"],
    ["evidence_certification_cloud"],
  ]);
});

test("returns an empty composition without invoking the composer when no claims are supported", async () => {
  const composer = new FakeComposer(validComposition);
  const result = await generateCvForJob({
    jobDescription: { text: "Rust role" },
    evidenceRepository: new InMemoryCandidateEvidenceRepository([evidence[0]]),
    extractor: new FakeExtractor([
      { type: "skill", text: "Rust", preference: "required", priority: "high", name: "Rust" },
    ]),
    composer,
  });

  assert.equal(result.matches.all().length, 1);
  assert.equal(result.matches.all()[0].outcome, "unsupported");
  assert.deepEqual(result.claims.all(), []);
  assert.deepEqual(result.composition, { summary: null, entries: [] });
  assert.deepEqual(composer.contexts, []);
});

test("propagates established boundary failures unchanged", async () => {
  const repository = new InMemoryCandidateEvidenceRepository(evidence);
  const failingExtractor: JobRequirementExtractor = {
    async extract(): Promise<never> {
      throw new Error("extractor unavailable");
    },
  };

  await assert.rejects(
    () => generateCvForJob({
      jobDescription: { text: "Role" },
      evidenceRepository: repository,
      extractor: failingExtractor,
      composer: new FakeComposer(validComposition),
    }),
    (error: unknown) => error instanceof JobRequirementExtractorInvocationError,
  );
  await assert.rejects(
    () => generateCvForJob({
      jobDescription: { text: "Role" },
      evidenceRepository: new InMemoryCandidateEvidenceRepository([{ ...evidence[0], name: "" }]),
      extractor: new FakeExtractor(requirements),
      composer: new FakeComposer(validComposition),
    }),
    InvalidPersistedCandidateEvidenceError,
  );
  await assert.rejects(
    () => generateCvForJob({
      jobDescription: { text: "Role" },
      evidenceRepository: repository,
      extractor: new FakeExtractor(requirements),
      composer: { async compose(): Promise<never> { throw new Error("composer unavailable"); } },
    }),
    CvComposerInvocationError,
  );
  await assert.rejects(
    () => generateCvForJob({
      jobDescription: { text: "Role" },
      evidenceRepository: repository,
      extractor: new FakeExtractor(requirements),
      composer: new FakeComposer({ summary: null, entries: [{ kind: "skill", text: "TypeScript", claimIds: ["claim_missing"] }] }),
    }),
    CvCompositionValidationError,
  );
});
