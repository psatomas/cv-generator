import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateEvidenceCollectionValidationError,
  createCandidateEvidenceCollection,
} from "./candidate-evidence-collection.ts";
import { parseCandidateEvidence, type CandidateEvidence } from "./candidate-evidence.ts";

const provenance = {
  kind: "candidate-statement",
  statement: "Candidate confirmed this information.",
  recordedOn: "2026-10-03",
};

const experience = parseCandidateEvidence({
  id: "evidence_experience_acme_engineer",
  type: "professional-experience",
  provenance,
  employer: "Acme",
  role: "Software Engineer",
  startDate: "2022-01",
  highlights: ["Built an internal platform."],
});

const skill = parseCandidateEvidence({
  id: "evidence_skill_typescript",
  type: "skill",
  provenance,
  name: "TypeScript",
  level: "advanced",
});

const project = parseCandidateEvidence({
  id: "evidence_project_protocol",
  type: "project",
  provenance,
  name: "Protocol Explorer",
  technologies: ["TypeScript", "Solidity"],
  highlights: ["Implemented protocol monitoring."],
});

test("creates a collection that preserves input order", () => {
  const collection = createCandidateEvidenceCollection([experience, skill, project]);

  assert.deepEqual(
    collection.all().map((evidence) => evidence.id),
    [experience.id, skill.id, project.id],
  );
});

test("rejects non-array and empty collection input", () => {
  assert.throws(
    () => createCandidateEvidenceCollection({}),
    (error: unknown) =>
      error instanceof CandidateEvidenceCollectionValidationError &&
      error.issue === "items must be an array of candidate evidence",
  );
  assert.throws(
    () => createCandidateEvidenceCollection([]),
    (error: unknown) =>
      error instanceof CandidateEvidenceCollectionValidationError &&
      error.issue === "items must contain at least one candidate evidence item",
  );
});

test("rejects invalid and duplicate evidence items", () => {
  assert.throws(
    () => createCandidateEvidenceCollection([{ id: "invalid" }]),
    (error: unknown) =>
      error instanceof CandidateEvidenceCollectionValidationError &&
      error.issue.startsWith("item at index 0 is invalid:"),
  );
  assert.throws(
    () => createCandidateEvidenceCollection([experience, experience]),
    (error: unknown) =>
      error instanceof CandidateEvidenceCollectionValidationError &&
      error.issue === `duplicate evidence id: ${experience.id}`,
  );
});

test("looks up evidence by stable identifier", () => {
  const collection = createCandidateEvidenceCollection([experience, skill]);

  assert.equal(collection.getById(experience.id)?.id, experience.id);
  assert.equal(collection.getById("evidence_missing"), undefined);
});

test("filters evidence by type while preserving relative order", () => {
  const collection = createCandidateEvidenceCollection([skill, experience, project]);

  assert.deepEqual(
    collection.getByType("project").map((evidence) => evidence.id),
    [project.id],
  );
  assert.deepEqual(collection.getByType("certification"), []);
});

test("does not expose mutable collection state", () => {
  const collection = createCandidateEvidenceCollection([experience, skill]);
  const returned = collection.all();
  const storedExperience = collection.getById(experience.id);

  assert.ok(storedExperience);
  assert.throws(() => (returned as unknown as CandidateEvidence[]).push(project), TypeError);
  assert.throws(
    () => (storedExperience.provenance as { recordedOn: string }).recordedOn = "2020-01-01",
    TypeError,
  );
  assert.deepEqual(collection.all().map((evidence) => evidence.id), [experience.id, skill.id]);
});
