import assert from "node:assert/strict";
import test from "node:test";

import { createCandidateEvidenceCollection } from "./candidate-evidence-collection.ts";
import {
  EvidenceRequirementMatchCollectionValidationError,
  createEvidenceRequirementMatchCollection,
} from "./evidence-requirement-match-collection.ts";
import { createJobRequirementCollection } from "./job-requirement-collection.ts";
import type { EvidenceRequirementMatch } from "./evidence-requirement-match.ts";

const evidence = createCandidateEvidenceCollection([
  {
    id: "evidence_skill_typescript",
    type: "skill",
    provenance: {
      kind: "candidate-statement",
      statement: "Candidate confirmed this information.",
      recordedOn: "2026-10-03",
    },
    name: "TypeScript",
    level: "advanced",
  },
  {
    id: "evidence_project_protocol",
    type: "project",
    provenance: {
      kind: "candidate-statement",
      statement: "Candidate confirmed this information.",
      recordedOn: "2026-10-03",
    },
    name: "Protocol Explorer",
    technologies: ["TypeScript"],
    highlights: ["Implemented protocol monitoring."],
  },
]);

const requirements = createJobRequirementCollection([
  {
    id: "requirement_skill_typescript",
    type: "skill",
    text: "Strong TypeScript skills",
    preference: "required",
    priority: "high",
    name: "TypeScript",
  },
  {
    id: "requirement_experience_backend",
    type: "experience",
    text: "Three years of backend experience",
    preference: "preferred",
    priority: "medium",
    area: "Backend engineering",
  },
  {
    id: "requirement_language_english",
    type: "language",
    text: "Fluent English",
    preference: "required",
    priority: "high",
    language: "English",
    proficiency: "fluent",
  },
  {
    id: "requirement_certification_cloud",
    type: "certification",
    text: "Cloud certification",
    preference: "preferred",
    priority: "medium",
    name: "Cloud Practitioner",
  },
]);

const validMatches: readonly EvidenceRequirementMatch[] = [
  {
    id: "match_typescript_supported",
    requirementId: "requirement_skill_typescript",
    outcome: "supported",
    evidenceIds: ["evidence_skill_typescript"],
    explanation: "Candidate evidence demonstrates the required skill.",
  },
  {
    id: "match_backend_partial",
    requirementId: "requirement_experience_backend",
    outcome: "partially-supported",
    evidenceIds: ["evidence_project_protocol"],
    explanation: "Project evidence demonstrates related backend experience.",
  },
  {
    id: "match_english_unsupported",
    requirementId: "requirement_language_english",
    outcome: "unsupported",
    evidenceIds: [],
    explanation: "No candidate evidence establishes English proficiency.",
  },
  {
    id: "match_cloud_supported",
    requirementId: "requirement_certification_cloud",
    outcome: "supported",
    evidenceIds: ["evidence_project_protocol"],
    explanation: "Project evidence demonstrates the relevant cloud experience.",
  },
];

function createCollection(matches: unknown) {
  return createEvidenceRequirementMatchCollection({ evidence, requirements, matches });
}

test("creates a collection that preserves exact match input order", () => {
  const collection = createCollection(validMatches);

  assert.deepEqual(
    collection.all().map((match) => match.id),
    validMatches.map((match) => match.id),
  );
});

test("allows an empty match set while coverage is optional", () => {
  assert.deepEqual(createCollection([]).all(), []);
});

test("rejects invalid match items with index context", () => {
  assert.throws(
    () => createCollection([{ id: "invalid" }]),
    (error: unknown) =>
      error instanceof EvidenceRequirementMatchCollectionValidationError &&
      error.issue.startsWith("match at index 0 is invalid:"),
  );
});

test("rejects duplicate match identifiers and requirement coverage", () => {
  assert.throws(
    () => createCollection([validMatches[0], validMatches[0]]),
    (error: unknown) =>
      error instanceof EvidenceRequirementMatchCollectionValidationError &&
      error.issue === `duplicate match id: ${validMatches[0].id}`,
  );
  assert.throws(
    () => createCollection([
      validMatches[0],
      { ...validMatches[1], id: "match_typescript_partial", requirementId: validMatches[0].requirementId },
    ]),
    (error: unknown) =>
      error instanceof EvidenceRequirementMatchCollectionValidationError &&
      error.issue === `duplicate requirement coverage: ${validMatches[0].requirementId}`,
  );
});

test("rejects unknown requirement and evidence references", () => {
  assert.throws(
    () => createCollection([{ ...validMatches[0], requirementId: "requirement_unknown" }]),
    (error: unknown) =>
      error instanceof EvidenceRequirementMatchCollectionValidationError &&
      error.issue === "unknown requirement id: requirement_unknown",
  );
  assert.throws(
    () => createCollection([{ ...validMatches[0], evidenceIds: ["evidence_unknown"] }]),
    (error: unknown) =>
      error instanceof EvidenceRequirementMatchCollectionValidationError &&
      error.issue === "unknown evidence id: evidence_unknown",
  );
});

test("looks up matches by match and requirement identifiers", () => {
  const collection = createCollection(validMatches);

  assert.equal(collection.getById(validMatches[0].id)?.id, validMatches[0].id);
  assert.equal(collection.getById("match_unknown"), undefined);
  assert.equal(
    collection.getByRequirementId(validMatches[1].requirementId)?.id,
    validMatches[1].id,
  );
  assert.equal(collection.getByRequirementId("requirement_unknown"), undefined);
});

test("filters by outcome while preserving relative order", () => {
  const collection = createCollection([
    validMatches[0],
    validMatches[3],
    validMatches[1],
    validMatches[2],
  ]);

  assert.deepEqual(
    collection.getByOutcome("supported").map((match) => match.id),
    [validMatches[0].id, validMatches[3].id],
  );
  assert.deepEqual(collection.getByOutcome("unsupported").map((match) => match.id), [validMatches[2].id]);
});

test("does not expose mutable match state", () => {
  const collection = createCollection(validMatches);
  const returned = collection.all();
  const storedMatch = collection.getById(validMatches[0].id);

  assert.ok(storedMatch);
  assert.throws(() => (returned as unknown as EvidenceRequirementMatch[]).pop(), TypeError);
  assert.throws(
    () => (storedMatch as { explanation: string }).explanation = "Changed externally.",
    TypeError,
  );
  assert.throws(
    () => (storedMatch.evidenceIds as unknown as string[]).push("evidence_changed_externally"),
    TypeError,
  );
  assert.deepEqual(collection.all().map((match) => match.id), validMatches.map((match) => match.id));
});
