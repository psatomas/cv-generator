import assert from "node:assert/strict";
import test from "node:test";

import {
  CvComposerInvocationError,
  CvCompositionValidationError,
  composeCv,
  type CvComposer,
  type CvCompositionContext,
} from "./cv-composition.ts";
import { createCandidateEvidenceCollection } from "../domain/candidate-evidence-collection.ts";
import { createJobRequirementCollection } from "../domain/job-requirement-collection.ts";
import { createSupportedClaimCollection } from "../domain/supported-claim-collection.ts";

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

const evidence = createCandidateEvidenceCollection([
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
  {
    id: "requirement_certification_cloud",
    type: "certification",
    text: "Cloud Practitioner certification",
    preference: "preferred",
    priority: "medium",
    name: "Cloud Practitioner",
  },
  {
    id: "requirement_experience_backend",
    type: "experience",
    text: "Backend experience",
    preference: "required",
    priority: "high",
    area: "Backend engineering",
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
    {
      id: "claim_certification_cloud",
      text: "Cloud Practitioner",
      requirementId: "requirement_certification_cloud",
      evidenceIds: ["evidence_certification_cloud"],
    },
  ],
});

function compose(composer: CvComposer) {
  return composeCv({ claims, evidence, requirements, composer });
}

const validComposition = {
  summary: { text: "TypeScript and cloud certified.", claimIds: ["claim_skill_typescript"] },
  entries: [
    { kind: "skill", text: "TypeScript", claimIds: ["claim_skill_typescript"] },
    { kind: "certification", text: "Cloud Practitioner", claimIds: ["claim_certification_cloud"] },
  ],
};

test("gives the composer only claim-authorized evidence and requirements in claim order", async () => {
  const composer = new FakeComposer(validComposition);
  await compose(composer);

  assert.equal(composer.contexts.length, 1);
  const context = composer.contexts[0];
  assert.deepEqual(context.claims.map((item) => item.claim.id), [
    "claim_skill_typescript",
    "claim_certification_cloud",
  ]);
  assert.deepEqual(context.claims.map((item) => item.requirement.id), [
    "requirement_skill_typescript",
    "requirement_certification_cloud",
  ]);
  assert.deepEqual(context.claims.map((item) => item.evidence.map((evidenceItem) => evidenceItem.id)), [
    ["evidence_skill_typescript"],
    ["evidence_certification_cloud"],
  ]);
});

test("returns a canonical grounded composition with or without summary", async () => {
  const composition = await compose(new FakeComposer(validComposition));

  assert.deepEqual(composition, validComposition);
  const withoutSummary = await compose(
    new FakeComposer({ summary: null, entries: validComposition.entries }),
  );
  assert.equal(withoutSummary.summary, null);
});

test("rejects ungrounded or malformed factual output", async () => {
  await assert.rejects(
    () => compose(new FakeComposer({ summary: null, entries: [{ kind: "skill", text: "TypeScript", claimIds: [] }] })),
    (error: unknown) =>
      error instanceof CvCompositionValidationError &&
      error.issue === "entries[0].claimIds must contain at least one supported claim identifier",
  );
  await assert.rejects(
    () => compose(new FakeComposer({ summary: null, entries: [{ kind: "skill", text: "TypeScript", claimIds: ["claim_missing"] }] })),
    (error: unknown) =>
      error instanceof CvCompositionValidationError &&
      error.issue === "entries[0].claimIds[0] references an unknown supported claim id: claim_missing",
  );
  await assert.rejects(
    () => compose(new FakeComposer({ summary: null, entries: [{ kind: "skill", text: "TypeScript", claimIds: ["claim_skill_typescript", "claim_skill_typescript"] }] })),
    (error: unknown) =>
      error instanceof CvCompositionValidationError &&
      error.issue === "entries[0].claimIds must not contain duplicates",
  );
  await assert.rejects(
    () => compose(new FakeComposer({ summary: null, entries: [{ kind: "skill", text: " ", claimIds: ["claim_skill_typescript"] }] })),
    CvCompositionValidationError,
  );
  await assert.rejects(
    () => compose(new FakeComposer({ summary: null, entries: [{ kind: "project", text: "TypeScript", claimIds: ["claim_skill_typescript"] }] })),
    (error: unknown) =>
      error instanceof CvCompositionValidationError &&
      error.issue === "entries[0].kind must be one of: skill, certification, statement",
  );
});

test("rejects an ungrounded summary", async () => {
  await assert.rejects(
    () => compose(new FakeComposer({ summary: { text: "Summary", claimIds: ["claim_missing"] }, entries: [] })),
    CvCompositionValidationError,
  );
});

test("wraps composer invocation failures without swallowing their cause", async () => {
  const composer: CvComposer = {
    async compose(): Promise<never> {
      throw new Error("provider unavailable");
    },
  };

  await assert.rejects(
    () => compose(composer),
    (error: unknown) =>
      error instanceof CvComposerInvocationError &&
      error.cause instanceof Error &&
      error.cause.message === "provider unavailable",
  );
});

test("does not invoke a composer when no facts are authorized", async () => {
  const emptyClaims = createSupportedClaimCollection({ evidence, requirements, claims: [] });
  const composer = new FakeComposer(validComposition);

  const composition = await composeCv({
    claims: emptyClaims,
    evidence,
    requirements,
    composer,
  });

  assert.deepEqual(composition, { summary: null, entries: [] });
  assert.deepEqual(composer.contexts, []);
});

test("exposes immutable canonical arrays and claim references", async () => {
  const composition = await compose(new FakeComposer(validComposition));

  assert.throws(() => (composition.entries as unknown as []).pop(), TypeError);
  assert.throws(() => (composition.entries[0].claimIds as unknown as string[]).pop(), TypeError);
  assert.deepEqual(composition.entries, validComposition.entries);
});
