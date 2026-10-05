import assert from "node:assert/strict";
import test from "node:test";

import {
  createCandidateEvidenceCollection,
} from "./candidate-evidence-collection.ts";
import {
  createJobRequirementCollection,
} from "./job-requirement-collection.ts";
import {
  SupportedClaimCollectionValidationError,
  createSupportedClaimCollection,
} from "./supported-claim-collection.ts";
import type { SupportedClaim } from "./supported-claim.ts";

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
    id: "evidence_project_backend",
    type: "project",
    provenance,
    name: "Backend API",
    technologies: ["TypeScript"],
    highlights: ["Built the API."],
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
    id: "requirement_experience_backend",
    type: "experience",
    text: "Backend experience",
    preference: "preferred",
    priority: "medium",
    area: "Backend engineering",
  },
]);

const claims = [
  {
    id: "claim_typescript_skill",
    text: "TypeScript",
    requirementId: "requirement_skill_typescript",
    evidenceIds: ["evidence_skill_typescript"],
  },
  {
    id: "claim_typescript_project",
    text: "Backend API built with TypeScript",
    requirementId: "requirement_skill_typescript",
    evidenceIds: ["evidence_project_backend", "evidence_skill_typescript"],
  },
] as const;

test("creates an ordered collection and permits multiple claims for one requirement", () => {
  const collection = createSupportedClaimCollection({ evidence, requirements, claims });

  assert.deepEqual(collection.all().map((claim) => claim.id), claims.map((claim) => claim.id));
  assert.deepEqual(
    collection.getByRequirementId("requirement_skill_typescript").map((claim) => claim.id),
    claims.map((claim) => claim.id),
  );
  assert.deepEqual(collection.getByRequirementId("requirement_experience_backend"), []);
});

test("allows an empty claim collection", () => {
  const collection = createSupportedClaimCollection({ evidence, requirements, claims: [] });

  assert.deepEqual(collection.all(), []);
});

test("looks up claims by stable identifier", () => {
  const collection = createSupportedClaimCollection({ evidence, requirements, claims });

  assert.equal(collection.getById("claim_typescript_skill")?.text, "TypeScript");
  assert.equal(collection.getById("claim_missing"), undefined);
});

test("does not expose mutable collection arrays or claims", () => {
  const collection = createSupportedClaimCollection({ evidence, requirements, claims });
  const all = collection.all();
  const byRequirement = collection.getByRequirementId("requirement_skill_typescript");
  const claim = collection.getById("claim_typescript_skill");

  assert.ok(claim);
  assert.throws(() => (all as SupportedClaim[]).pop(), TypeError);
  assert.throws(() => (byRequirement as SupportedClaim[]).pop(), TypeError);
  assert.throws(() => (claim.evidenceIds as unknown as string[]).push("evidence_changed"), TypeError);
  assert.deepEqual(collection.all().map((item) => item.id), claims.map((item) => item.id));
});

test("rejects duplicate claims and invalid claim inputs with deterministic context", () => {
  assert.throws(
    () => createSupportedClaimCollection({ evidence, requirements, claims: [claims[0], claims[0]] }),
    (error: unknown) =>
      error instanceof SupportedClaimCollectionValidationError &&
      error.issue === "duplicate claim id: claim_typescript_skill",
  );
  assert.throws(
    () => createSupportedClaimCollection({ evidence, requirements, claims: [{ ...claims[0], text: "" }] }),
    (error: unknown) =>
      error instanceof SupportedClaimCollectionValidationError &&
      error.issue === "claim at index 0 is invalid: text must be a non-empty string",
  );
});

test("rejects unknown requirement and evidence references", () => {
  assert.throws(
    () => createSupportedClaimCollection({ evidence, requirements, claims: [{ ...claims[0], requirementId: "requirement_skill_rust" }] }),
    (error: unknown) =>
      error instanceof SupportedClaimCollectionValidationError &&
      error.issue === "unknown requirement id: requirement_skill_rust",
  );
  assert.throws(
    () => createSupportedClaimCollection({ evidence, requirements, claims: [{ ...claims[0], evidenceIds: ["evidence_skill_rust"] }] }),
    (error: unknown) =>
      error instanceof SupportedClaimCollectionValidationError &&
      error.issue === "unknown evidence id: evidence_skill_rust",
  );
});
