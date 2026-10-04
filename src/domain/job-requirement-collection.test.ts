import assert from "node:assert/strict";
import test from "node:test";

import {
  JobRequirementCollectionValidationError,
  createJobRequirementCollection,
} from "./job-requirement-collection.ts";
import { parseJobRequirement, type JobRequirement } from "./job-requirement.ts";

const common = {
  preference: "required",
  priority: "high",
};

const skill = parseJobRequirement({
  ...common,
  id: "requirement_skill_typescript",
  type: "skill",
  text: "Strong TypeScript skills",
  name: "TypeScript",
});

const preferredSkill = parseJobRequirement({
  ...common,
  id: "requirement_skill_rust",
  type: "skill",
  text: "Rust experience is preferred",
  preference: "preferred",
  name: "Rust",
});

const experience = parseJobRequirement({
  ...common,
  id: "requirement_experience_backend",
  type: "experience",
  text: "Three years of backend experience",
  area: "Backend engineering",
  minimumYears: 3,
});

test("creates a collection that preserves exact input order", () => {
  const collection = createJobRequirementCollection([experience, skill, preferredSkill]);

  assert.deepEqual(
    collection.all().map((requirement) => requirement.id),
    [experience.id, skill.id, preferredSkill.id],
  );
});

test("rejects non-array and empty collection input", () => {
  assert.throws(
    () => createJobRequirementCollection({}),
    (error: unknown) =>
      error instanceof JobRequirementCollectionValidationError &&
      error.issue === "items must be an array of job requirements",
  );
  assert.throws(
    () => createJobRequirementCollection([]),
    (error: unknown) =>
      error instanceof JobRequirementCollectionValidationError &&
      error.issue === "items must contain at least one job requirement",
  );
});

test("rejects invalid items and duplicate requirement identifiers", () => {
  assert.throws(
    () => createJobRequirementCollection([{ id: "invalid" }]),
    (error: unknown) =>
      error instanceof JobRequirementCollectionValidationError &&
      error.issue.startsWith("item at index 0 is invalid:"),
  );
  assert.throws(
    () => createJobRequirementCollection([skill, skill]),
    (error: unknown) =>
      error instanceof JobRequirementCollectionValidationError &&
      error.issue === `duplicate requirement id: ${skill.id}`,
  );
});

test("looks up requirements by stable identifier", () => {
  const collection = createJobRequirementCollection([skill, experience]);

  assert.equal(collection.getById(skill.id)?.id, skill.id);
  assert.equal(collection.getById("requirement_missing"), undefined);
});

test("filters by type and preserves relative order", () => {
  const collection = createJobRequirementCollection([preferredSkill, experience, skill]);

  assert.deepEqual(
    collection.getByType("skill").map((requirement) => requirement.id),
    [preferredSkill.id, skill.id],
  );
  assert.deepEqual(collection.getByType("certification"), []);
});

test("filters by preference and preserves relative order", () => {
  const collection = createJobRequirementCollection([preferredSkill, experience, skill]);

  assert.deepEqual(
    collection.getByPreference("required").map((requirement) => requirement.id),
    [experience.id, skill.id],
  );
  assert.deepEqual(
    collection.getByPreference("preferred").map((requirement) => requirement.id),
    [preferredSkill.id],
  );
});

test("does not expose mutable collection state", () => {
  const collection = createJobRequirementCollection([skill, experience]);
  const returned = collection.all();
  const storedSkill = collection.getById(skill.id);

  assert.ok(storedSkill);
  assert.throws(() => (returned as unknown as JobRequirement[]).push(preferredSkill), TypeError);
  assert.throws(() => (storedSkill as { name: string }).name = "Changed externally.", TypeError);
  assert.deepEqual(collection.all().map((requirement) => requirement.id), [skill.id, experience.id]);
});
