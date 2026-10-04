import assert from "node:assert/strict";
import test from "node:test";

import {
  EvidenceRequirementMatchValidationError,
  parseEvidenceRequirementMatch,
  type EvidenceRequirementMatch,
} from "./evidence-requirement-match.ts";

const common = {
  requirementId: "requirement_skill_typescript",
  explanation: "Candidate evidence demonstrates the required skill.",
} as const;

const validMatches: readonly EvidenceRequirementMatch[] = [
  {
    ...common,
    id: "match_typescript_supported",
    outcome: "supported",
    evidenceIds: ["evidence_skill_typescript"],
  },
  {
    ...common,
    id: "match_typescript_partial",
    outcome: "partially-supported",
    evidenceIds: ["evidence_project_protocol", "evidence_skill_typescript"],
  },
  {
    ...common,
    id: "match_typescript_unsupported",
    outcome: "unsupported",
    evidenceIds: [],
  },
];

test("parses every supported match outcome", () => {
  for (const match of validMatches) {
    const parsed = parseEvidenceRequirementMatch(match);
    assert.equal(parsed.id, match.id);
    assert.equal(parsed.requirementId, match.requirementId);
    assert.equal(parsed.outcome, match.outcome);
    assert.deepEqual(parsed.evidenceIds, match.evidenceIds);
  }
});

test("freezes parsed evidence references at runtime", () => {
  for (const match of validMatches) {
    const parsed = parseEvidenceRequirementMatch(match);

    assert.throws(
      () => (parsed.evidenceIds as unknown as string[]).push("evidence_changed_externally"),
      TypeError,
    );
    assert.deepEqual(parsed.evidenceIds, match.evidenceIds);
  }
});

test("rejects invalid match and requirement identifiers", () => {
  assert.throws(
    () => parseEvidenceRequirementMatch({ ...validMatches[0], id: "typescript_supported" }),
    (error: unknown) =>
      error instanceof EvidenceRequirementMatchValidationError &&
      error.issue === "id must use the match_<lowercase-identifier> format",
  );
  assert.throws(
    () => parseEvidenceRequirementMatch({ ...validMatches[0], requirementId: "skill_typescript" }),
    (error: unknown) =>
      error instanceof EvidenceRequirementMatchValidationError &&
      error.issue === "requirementId must use the requirement_<lowercase-identifier> format",
  );
});

test("rejects invalid outcomes and empty explanations", () => {
  assert.throws(
    () => parseEvidenceRequirementMatch({ ...validMatches[0], outcome: "uncertain" }),
    EvidenceRequirementMatchValidationError,
  );
  assert.throws(
    () => parseEvidenceRequirementMatch({ ...validMatches[0], explanation: " " }),
    (error: unknown) =>
      error instanceof EvidenceRequirementMatchValidationError &&
      error.issue === "explanation must be a non-empty string",
  );
});

test("requires evidence for supported and partially-supported outcomes", () => {
  for (const match of validMatches.slice(0, 2)) {
    assert.throws(
      () => parseEvidenceRequirementMatch({ ...match, evidenceIds: [] }),
      (error: unknown) =>
        error instanceof EvidenceRequirementMatchValidationError &&
        error.issue === `${match.outcome} matches must reference at least one evidence id`,
    );
  }
});

test("rejects evidence references for unsupported outcomes", () => {
  assert.throws(
    () => parseEvidenceRequirementMatch({ ...validMatches[2], evidenceIds: ["evidence_skill_typescript"] }),
    (error: unknown) =>
      error instanceof EvidenceRequirementMatchValidationError &&
      error.issue === "unsupported matches must not reference evidence ids",
  );
});

test("rejects malformed and duplicate evidence references", () => {
  assert.throws(
    () => parseEvidenceRequirementMatch({ ...validMatches[0], evidenceIds: ["skill_typescript"] }),
    EvidenceRequirementMatchValidationError,
  );
  assert.throws(
    () => parseEvidenceRequirementMatch({ ...validMatches[0], evidenceIds: ["evidence_skill_typescript", "evidence_skill_typescript"] }),
    (error: unknown) =>
      error instanceof EvidenceRequirementMatchValidationError &&
      error.issue === "evidenceIds must not contain duplicates",
  );
});
