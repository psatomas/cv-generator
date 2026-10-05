import assert from "node:assert/strict";
import test from "node:test";

import { createCandidateEvidenceCollection } from "./candidate-evidence-collection.ts";
import { deriveSupportedClaims } from "./derive-supported-claims.ts";
import { createEvidenceRequirementMatchCollection } from "./evidence-requirement-match-collection.ts";
import { createJobRequirementCollection } from "./job-requirement-collection.ts";

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
    id: "requirement_certification_cloud",
    type: "certification",
    text: "Cloud Practitioner certification",
    preference: "required",
    priority: "high",
    name: "Cloud Practitioner",
  },
  {
    id: "requirement_skill_typescript",
    type: "skill",
    text: "Strong TypeScript skills",
    preference: "required",
    priority: "high",
    name: "TypeScript",
  },
  {
    id: "requirement_skill_rust",
    type: "skill",
    text: "Rust skills",
    preference: "preferred",
    priority: "medium",
    name: "Rust",
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

function derive(matches: readonly unknown[]) {
  return deriveSupportedClaims({
    evidence,
    requirements,
    matches: createEvidenceRequirementMatchCollection({ evidence, requirements, matches }),
  });
}

test("derives supported skill and certification claims in match order", () => {
  const claims = derive([
    {
      id: "match_requirement_certification_cloud",
      requirementId: "requirement_certification_cloud",
      outcome: "supported",
      evidenceIds: ["evidence_certification_cloud"],
      explanation: "Exact certification match.",
    },
    {
      id: "match_requirement_skill_typescript",
      requirementId: "requirement_skill_typescript",
      outcome: "supported",
      evidenceIds: ["evidence_skill_typescript"],
      explanation: "Exact skill match.",
    },
  ]);

  assert.deepEqual(claims.all(), [
    {
      id: "claim_certification_cloud",
      text: "Cloud Practitioner",
      requirementId: "requirement_certification_cloud",
      evidenceIds: ["evidence_certification_cloud"],
    },
    {
      id: "claim_skill_typescript",
      text: "TypeScript",
      requirementId: "requirement_skill_typescript",
      evidenceIds: ["evidence_skill_typescript"],
    },
  ]);
});

test("does not derive claims from unsupported or partially-supported matches", () => {
  const claims = derive([
    {
      id: "match_requirement_skill_rust",
      requirementId: "requirement_skill_rust",
      outcome: "unsupported",
      evidenceIds: [],
      explanation: "No Rust evidence.",
    },
    {
      id: "match_requirement_skill_typescript_partial",
      requirementId: "requirement_skill_typescript",
      outcome: "partially-supported",
      evidenceIds: ["evidence_skill_typescript"],
      explanation: "Only partial support.",
    },
  ]);

  assert.deepEqual(claims.all(), []);
});

test("does not invent claim semantics for supported requirement types without deterministic rules", () => {
  const claims = derive([
    {
      id: "match_requirement_experience_backend",
      requirementId: "requirement_experience_backend",
      outcome: "supported",
      evidenceIds: ["evidence_project_backend"],
      explanation: "Externally supplied support.",
    },
  ]);

  assert.deepEqual(claims.all(), []);
});

test("preserves all supporting evidence references from a supported match", () => {
  const claims = derive([
    {
      id: "match_requirement_skill_typescript",
      requirementId: "requirement_skill_typescript",
      outcome: "supported",
      evidenceIds: ["evidence_project_backend", "evidence_skill_typescript"],
      explanation: "Exact skill match.",
    },
  ]);

  assert.deepEqual(claims.all()[0].evidenceIds, [
    "evidence_project_backend",
    "evidence_skill_typescript",
  ]);
});
