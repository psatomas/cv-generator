import assert from "node:assert/strict";
import test from "node:test";

import { createCandidateEvidenceCollection } from "./candidate-evidence-collection.ts";
import { matchEvidenceToRequirements } from "./deterministic-requirement-matching.ts";
import { createJobRequirementCollection } from "./job-requirement-collection.ts";

const evidence = createCandidateEvidenceCollection([
  {
    id: "evidence_skill_typescript_primary",
    type: "skill",
    provenance: {
      kind: "candidate-statement",
      statement: "Candidate confirmed this information.",
      recordedOn: "2026-10-04",
    },
    name: " TypeScript ",
    level: "advanced",
  },
  {
    id: "evidence_skill_typescript_secondary",
    type: "skill",
    provenance: {
      kind: "candidate-statement",
      statement: "Candidate confirmed this information.",
      recordedOn: "2026-10-04",
    },
    name: "typescript",
    level: "working",
  },
  {
    id: "evidence_certification_cloud",
    type: "certification",
    provenance: {
      kind: "document",
      documentName: "Certification certificate",
      recordedOn: "2026-10-04",
    },
    name: "Cloud Practitioner",
    issuer: "Example Cloud",
    awardedOn: "2024-04-30",
  },
  {
    id: "evidence_project_unrelated",
    type: "project",
    provenance: {
      kind: "candidate-statement",
      statement: "Candidate confirmed this information.",
      recordedOn: "2026-10-04",
    },
    name: "Unrelated Project",
    technologies: ["TypeScript"],
    highlights: ["Implemented an unrelated project."],
  },
]);

const requirements = createJobRequirementCollection([
  {
    id: "requirement_skill_typescript",
    type: "skill",
    text: "Strong TypeScript skills",
    preference: "required",
    priority: "high",
    name: "typescript",
  },
  {
    id: "requirement_skill_rust",
    type: "skill",
    text: "Strong Rust skills",
    preference: "preferred",
    priority: "medium",
    name: "Rust",
  },
  {
    id: "requirement_certification_cloud",
    type: "certification",
    text: "Cloud Practitioner certification",
    preference: "required",
    priority: "high",
    name: "cloud practitioner",
  },
  {
    id: "requirement_certification_security",
    type: "certification",
    text: "Security certification",
    preference: "preferred",
    priority: "medium",
    name: "Security Practitioner",
  },
  {
    id: "requirement_experience_backend",
    type: "experience",
    text: "Three years of backend experience",
    preference: "required",
    priority: "high",
    area: "Backend engineering",
    minimumYears: 3,
  },
]);

function match() {
  return matchEvidenceToRequirements({ evidence, requirements });
}

test("supports exact normalized skill matches in evidence order", () => {
  const result = match().getByRequirementId("requirement_skill_typescript");

  assert.deepEqual(result, {
    id: "match_requirement_skill_typescript",
    requirementId: "requirement_skill_typescript",
    outcome: "supported",
    evidenceIds: ["evidence_skill_typescript_primary", "evidence_skill_typescript_secondary"],
    explanation: "Skill evidence exactly matches required skill \"typescript\".",
  });
});

test("returns unsupported when a skill is absent", () => {
  const result = match().getByRequirementId("requirement_skill_rust");

  assert.deepEqual(result, {
    id: "match_requirement_skill_rust",
    requirementId: "requirement_skill_rust",
    outcome: "unsupported",
    evidenceIds: [],
    explanation: "No skill evidence exactly matches required skill \"Rust\".",
  });
});

test("supports exact normalized certification matches without unrelated evidence", () => {
  const result = match().getByRequirementId("requirement_certification_cloud");

  assert.deepEqual(result, {
    id: "match_requirement_certification_cloud",
    requirementId: "requirement_certification_cloud",
    outcome: "supported",
    evidenceIds: ["evidence_certification_cloud"],
    explanation: "Certification evidence exactly matches required certification \"cloud practitioner\".",
  });
});

test("returns unsupported when a certification is absent", () => {
  const result = match().getByRequirementId("requirement_certification_security");

  assert.equal(result?.outcome, "unsupported");
  assert.deepEqual(result?.evidenceIds, []);
});

test("preserves requirement order and produces stable results", () => {
  const first = match();
  const second = match();

  assert.deepEqual(
    first.all().map((result) => result.requirementId),
    requirements.all().map((requirement) => requirement.id),
  );
  assert.deepEqual(first.all(), second.all());
});

test("leaves requirement types without safe structured rules unsupported", () => {
  const result = match().getByRequirementId("requirement_experience_backend");

  assert.deepEqual(result, {
    id: "match_requirement_experience_backend",
    requirementId: "requirement_experience_backend",
    outcome: "unsupported",
    evidenceIds: [],
    explanation: "The deterministic matcher cannot establish support for experience requirements from available structured evidence.",
  });
});
