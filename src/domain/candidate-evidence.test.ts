import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateEvidenceValidationError,
  parseCandidateEvidence,
  type CandidateEvidence,
} from "./candidate-evidence.ts";

const provenance = {
  kind: "candidate-statement",
  statement: "Candidate confirmed this information.",
  recordedOn: "2026-10-03",
} as const;

const validEvidence: readonly CandidateEvidence[] = [
  {
    id: "evidence_experience_acme_engineer",
    type: "professional-experience",
    provenance,
    employer: "Acme",
    role: "Software Engineer",
    startDate: "2022-01",
    highlights: ["Built an internal platform."],
  },
  {
    id: "evidence_project_protocol",
    type: "project",
    provenance,
    name: "Protocol Explorer",
    technologies: ["TypeScript", "Solidity"],
    highlights: ["Implemented protocol monitoring."],
  },
  {
    id: "evidence_education_degree",
    type: "education",
    provenance,
    institution: "Example University",
    qualification: "BSc Computer Science",
    completedOn: "2021-12-15",
  },
  {
    id: "evidence_certification_cloud",
    type: "certification",
    provenance: {
      kind: "document",
      documentName: "Certification certificate",
      recordedOn: "2026-10-03",
      documentLocator: "https://example.com/certificate",
    },
    name: "Cloud Practitioner",
    issuer: "Example Cloud",
    awardedOn: "2024-04-30",
  },
  {
    id: "evidence_skill_typescript",
    type: "skill",
    provenance,
    name: "TypeScript",
    level: "advanced",
  },
  {
    id: "evidence_achievement_award",
    type: "achievement",
    provenance,
    title: "Engineering Award",
    description: "Recognized for delivery quality.",
  },
];

test("parses every supported candidate evidence type", () => {
  for (const evidence of validEvidence) {
    const parsed = parseCandidateEvidence(evidence);
    assert.equal(parsed.id, evidence.id);
    assert.equal(parsed.type, evidence.type);
    assert.deepEqual(parsed.provenance, evidence.provenance);
  }
});

test("rejects an invalid stable identifier", () => {
  const invalid = { ...validEvidence[0], id: "experience_acme" };

  assert.throws(
    () => parseCandidateEvidence(invalid),
    (error: unknown) =>
      error instanceof CandidateEvidenceValidationError &&
      error.issue === "id must use the evidence_<lowercase-identifier> format",
  );
});

test("rejects missing factual fields", () => {
  const invalid = { ...validEvidence[0], highlights: [] };

  assert.throws(
    () => parseCandidateEvidence(invalid),
    CandidateEvidenceValidationError,
  );
});

test("rejects professional experience that ends before it starts", () => {
  const invalid = { ...validEvidence[0], endDate: "2021-12" };

  assert.throws(
    () => parseCandidateEvidence(invalid),
    (error: unknown) =>
      error instanceof CandidateEvidenceValidationError &&
      error.issue === "endDate must not be earlier than startDate",
  );
});

test("rejects projects that end before they start", () => {
  const invalid = { ...validEvidence[1], startDate: "2024-01", endDate: "2023-12" };

  assert.throws(
    () => parseCandidateEvidence(invalid),
    (error: unknown) =>
      error instanceof CandidateEvidenceValidationError &&
      error.issue === "endDate must not be earlier than startDate",
  );
});

test("rejects invalid provenance and dates", () => {
  const invalid = {
    ...validEvidence[3],
    provenance: { kind: "document", documentName: "Certificate", recordedOn: "2026-02-30" },
  };

  assert.throws(
    () => parseCandidateEvidence(invalid),
    CandidateEvidenceValidationError,
  );
});

test("rejects unknown evidence types", () => {
  const invalid = { ...validEvidence[4], type: "language" };

  assert.throws(
    () => parseCandidateEvidence(invalid),
    CandidateEvidenceValidationError,
  );
});
