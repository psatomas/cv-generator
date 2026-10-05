import assert from "node:assert/strict";
import test from "node:test";

import {
  SupportedClaimValidationError,
  isSupportedClaimId,
  parseSupportedClaim,
} from "./supported-claim.ts";

const validClaim = {
  id: "claim_typescript_for_backend_role",
  text: "TypeScript",
  requirementId: "requirement_skill_typescript",
  evidenceIds: ["evidence_skill_typescript", "evidence_project_backend"],
} as const;

test("parses a traceable supported claim with stable identity", () => {
  const claim = parseSupportedClaim(validClaim);

  assert.equal(claim.id, validClaim.id);
  assert.equal(claim.text, validClaim.text);
  assert.equal(claim.requirementId, validClaim.requirementId);
  assert.deepEqual(claim.evidenceIds, validClaim.evidenceIds);
  assert.equal(isSupportedClaimId(claim.id), true);
});

test("preserves evidence reference order", () => {
  const claim = parseSupportedClaim({
    ...validClaim,
    evidenceIds: ["evidence_project_backend", "evidence_skill_typescript"],
  });

  assert.deepEqual(claim.evidenceIds, ["evidence_project_backend", "evidence_skill_typescript"]);
});

test("rejects malformed claim and requirement identifiers", () => {
  assert.throws(
    () => parseSupportedClaim({ ...validClaim, id: "typescript_claim" }),
    (error: unknown) =>
      error instanceof SupportedClaimValidationError &&
      error.issue === "id must use the claim_<lowercase-identifier> format",
  );
  assert.throws(
    () => parseSupportedClaim({ ...validClaim, requirementId: "skill_typescript" }),
    (error: unknown) =>
      error instanceof SupportedClaimValidationError &&
      error.issue === "requirementId must use the requirement_<lowercase-identifier> format",
  );
});

test("rejects missing or empty claim text", () => {
  assert.throws(
    () => parseSupportedClaim({ ...validClaim, text: " " }),
    (error: unknown) =>
      error instanceof SupportedClaimValidationError && error.issue === "text must be a non-empty string",
  );
  assert.throws(
    () => parseSupportedClaim({ ...validClaim, text: undefined }),
    SupportedClaimValidationError,
  );
});

test("requires a non-empty, valid, unique set of evidence references", () => {
  assert.throws(
    () => parseSupportedClaim({ ...validClaim, evidenceIds: undefined }),
    (error: unknown) =>
      error instanceof SupportedClaimValidationError &&
      error.issue === "evidenceIds must be an array of evidence identifiers",
  );
  assert.throws(
    () => parseSupportedClaim({ ...validClaim, evidenceIds: [] }),
    (error: unknown) =>
      error instanceof SupportedClaimValidationError &&
      error.issue === "evidenceIds must contain at least one evidence identifier",
  );
  assert.throws(
    () => parseSupportedClaim({ ...validClaim, evidenceIds: ["skill_typescript"] }),
    (error: unknown) =>
      error instanceof SupportedClaimValidationError &&
      error.issue === "evidenceIds[0] must use the evidence_<lowercase-identifier> format",
  );
  assert.throws(
    () => parseSupportedClaim({ ...validClaim, evidenceIds: ["evidence_skill_typescript", "evidence_skill_typescript"] }),
    (error: unknown) =>
      error instanceof SupportedClaimValidationError &&
      error.issue === "evidenceIds must not contain duplicates",
  );
});

test("freezes the canonical claim and its evidence references at runtime", () => {
  const claim = parseSupportedClaim(validClaim);

  assert.throws(
    () => (claim.evidenceIds as unknown as string[]).push("evidence_changed_externally"),
    TypeError,
  );
  assert.throws(() => (claim as { text: string }).text = "Changed externally", TypeError);
  assert.deepEqual(claim.evidenceIds, validClaim.evidenceIds);
  assert.equal(claim.text, validClaim.text);
});

test("rejects non-object and null inputs", () => {
  assert.throws(
    () => parseSupportedClaim("claim"),
    (error: unknown) =>
      error instanceof SupportedClaimValidationError && error.issue === "claim must be an object",
  );
  assert.throws(
    () => parseSupportedClaim(null),
    (error: unknown) =>
      error instanceof SupportedClaimValidationError && error.issue === "claim must be an object",
  );
});
