import assert from "node:assert/strict";
import test from "node:test";

import {
  JobRequirementValidationError,
  parseJobRequirement,
  type JobRequirement,
} from "./job-requirement.ts";

const common = {
  preference: "required",
  priority: "high",
} as const;

const validRequirements: readonly JobRequirement[] = [
  {
    ...common,
    id: "requirement_skill_typescript",
    type: "skill",
    text: "Strong TypeScript skills",
    name: "TypeScript",
  },
  {
    ...common,
    id: "requirement_experience_backend",
    type: "experience",
    text: "Three years of backend experience",
    area: "Backend engineering",
    minimumYears: 3,
  },
  {
    ...common,
    id: "requirement_education_degree",
    type: "education",
    text: "Bachelor degree in Computer Science",
    qualification: "Bachelor degree in Computer Science",
  },
  {
    ...common,
    id: "requirement_certification_cloud",
    type: "certification",
    text: "Cloud certification",
    name: "Cloud Practitioner",
  },
  {
    ...common,
    id: "requirement_responsibility_delivery",
    type: "responsibility",
    text: "Lead delivery of product features",
  },
  {
    ...common,
    id: "requirement_domain_fintech",
    type: "domain-knowledge",
    text: "Knowledge of fintech products",
    topic: "Fintech products",
  },
  {
    ...common,
    id: "requirement_language_english",
    type: "language",
    text: "Fluent English",
    language: "English",
    proficiency: "fluent",
  },
  {
    ...common,
    id: "requirement_location_remote",
    type: "location-work-arrangement",
    text: "Remote work in Brazil",
    location: "Brazil",
    arrangement: "remote",
  },
];

test("parses every supported job requirement type", () => {
  for (const requirement of validRequirements) {
    const parsed = parseJobRequirement(requirement);
    assert.equal(parsed.id, requirement.id);
    assert.equal(parsed.type, requirement.type);
    assert.equal(parsed.text, requirement.text);
  }
});

test("allows optional structured fields to be omitted", () => {
  const experience = parseJobRequirement({
    ...validRequirements[1],
    minimumYears: undefined,
  });
  const language = parseJobRequirement({
    ...validRequirements[6],
    proficiency: undefined,
  });
  const location = parseJobRequirement({
    ...validRequirements[7],
    location: undefined,
  });

  assert.equal(experience.type, "experience");
  assert.equal(experience.minimumYears, undefined);
  assert.equal(language.type, "language");
  assert.equal(language.proficiency, undefined);
  assert.equal(location.type, "location-work-arrangement");
  assert.equal(location.arrangement, "remote");
});

test("rejects an invalid requirement identifier", () => {
  const invalid = { ...validRequirements[0], id: "skill_typescript" };

  assert.throws(
    () => parseJobRequirement(invalid),
    (error: unknown) =>
      error instanceof JobRequirementValidationError &&
      error.issue === "id must use the requirement_<lowercase-identifier> format",
  );
});

test("rejects unsupported types and empty requirement text", () => {
  assert.throws(
    () => parseJobRequirement({ ...validRequirements[0], type: "salary" }),
    JobRequirementValidationError,
  );
  assert.throws(
    () => parseJobRequirement({ ...validRequirements[0], text: " " }),
    (error: unknown) =>
      error instanceof JobRequirementValidationError &&
      error.issue === "text must be a non-empty string",
  );
});

test("rejects invalid shared requirement values", () => {
  assert.throws(
    () => parseJobRequirement({ ...validRequirements[0], preference: "optional" }),
    (error: unknown) =>
      error instanceof JobRequirementValidationError &&
      error.issue === "preference must be one of: required, preferred",
  );
  assert.throws(
    () => parseJobRequirement({ ...validRequirements[0], priority: "urgent" }),
    (error: unknown) =>
      error instanceof JobRequirementValidationError &&
      error.issue === "priority must be one of: low, medium, high, critical",
  );
});

test("rejects missing or malformed subtype-specific fields", () => {
  assert.throws(
    () => parseJobRequirement({ ...validRequirements[0], name: "" }),
    JobRequirementValidationError,
  );
  assert.throws(
    () => parseJobRequirement({ ...validRequirements[1], minimumYears: 1.5 }),
    (error: unknown) =>
      error instanceof JobRequirementValidationError &&
      error.issue === "minimumYears must be a positive integer",
  );
  assert.throws(
    () => parseJobRequirement({ ...validRequirements[7], location: undefined, arrangement: undefined }),
    (error: unknown) =>
      error instanceof JobRequirementValidationError &&
      error.issue === "location or arrangement must be provided",
  );
});
