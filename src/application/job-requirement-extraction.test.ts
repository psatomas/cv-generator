import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidExtractedJobRequirementError,
  InvalidJobDescriptionError,
  JobRequirementExtractorInvocationError,
  extractJobRequirements,
  type JobDescription,
  type JobRequirementExtractor,
} from "./job-requirement-extraction.ts";

class FakeExtractor implements JobRequirementExtractor {
  public readonly calls: JobDescription[] = [];
  private readonly response: unknown;

  constructor(response: unknown) {
    this.response = response;
  }

  public async extract(jobDescription: JobDescription): Promise<unknown> {
    this.calls.push(jobDescription);
    return this.response;
  }
}

const common = {
  preference: "required",
  priority: "high",
} as const;

const candidates = [
  { ...common, id: "provider_controlled", type: "skill", text: "TypeScript", name: "TypeScript" },
  {
    ...common,
    type: "experience",
    text: "Three years of backend experience",
    area: "Backend engineering",
    minimumYears: 3,
  },
  {
    ...common,
    type: "education",
    text: "Bachelor degree",
    qualification: "Bachelor degree",
  },
  { ...common, type: "certification", text: "Cloud certification", name: "Cloud" },
  { ...common, type: "responsibility", text: "Lead delivery" },
  { ...common, type: "domain-knowledge", text: "Fintech knowledge", topic: "Fintech" },
  { ...common, type: "language", text: "Fluent English", language: "English", proficiency: "fluent" },
  {
    ...common,
    type: "location-work-arrangement",
    text: "Remote in Brazil",
    location: "Brazil",
    arrangement: "remote",
  },
] as const;

test("canonicalizes every current requirement type with application-owned ordered IDs", async () => {
  const extractor = new FakeExtractor(candidates);
  const result = await extractJobRequirements({
    jobDescription: { text: "Build reliable software." },
    extractor,
  });

  assert.deepEqual(extractor.calls, [{ text: "Build reliable software." }]);
  assert.equal(result.source.text, "Build reliable software.");
  assert.deepEqual(
    result.requirements.all().map((requirement) => [requirement.type, requirement.id]),
    [
      ["skill", "requirement_skill_001"],
      ["experience", "requirement_experience_002"],
      ["education", "requirement_education_003"],
      ["certification", "requirement_certification_004"],
      ["responsibility", "requirement_responsibility_005"],
      ["domain-knowledge", "requirement_domain-knowledge_006"],
      ["language", "requirement_language_007"],
      ["location-work-arrangement", "requirement_location-work-arrangement_008"],
    ],
  );
  assert.equal(result.requirements.all()[0].id, "requirement_skill_001");
});

test("preserves extractor order and gives duplicate semantic requirements distinct IDs", async () => {
  const extractor = new FakeExtractor([candidates[1], candidates[0], candidates[0]]);
  const result = await extractJobRequirements({
    jobDescription: { text: "Backend role" },
    extractor,
  });

  assert.deepEqual(
    result.requirements.all().map((requirement) => [requirement.type, requirement.id]),
    [
      ["experience", "requirement_experience_001"],
      ["skill", "requirement_skill_002"],
      ["skill", "requirement_skill_003"],
    ],
  );
});

test("produces equivalent canonical output for equivalent ordered extraction", async () => {
  const input = { jobDescription: { text: "TypeScript role" } };
  const first = await extractJobRequirements({ ...input, extractor: new FakeExtractor(candidates) });
  const second = await extractJobRequirements({ ...input, extractor: new FakeExtractor(candidates) });

  assert.deepEqual(first.requirements.all(), second.requirements.all());
});

test("canonicalizes nullable optional fields before domain parsing", async () => {
  const extractor = new FakeExtractor([
    { ...candidates[1], minimumYears: null },
    { ...candidates[6], proficiency: null },
    { ...candidates[7], location: null },
    { ...candidates[7], arrangement: null },
  ]);

  const result = await extractJobRequirements({
    jobDescription: { text: "Role" },
    extractor,
  });
  const [experience, language, remote, location] = result.requirements.all();

  assert.equal(experience.type, "experience");
  assert.equal(experience.minimumYears, undefined);
  assert.equal(language.type, "language");
  assert.equal(language.proficiency, undefined);
  assert.equal(remote.type, "location-work-arrangement");
  assert.equal(remote.location, undefined);
  assert.equal(location.type, "location-work-arrangement");
  assert.equal(location.arrangement, undefined);
});

test("keeps non-optional nullable fields subject to domain validation", async () => {
  const extractor = new FakeExtractor([{ ...candidates[0], name: null }]);

  await assert.rejects(
    () => extractJobRequirements({ jobDescription: { text: "Role" }, extractor }),
    (error: unknown) =>
      error instanceof InvalidExtractedJobRequirementError &&
      error.issue === "name must be a non-empty string",
  );
});

test("rejects empty source text before invoking the extractor", async () => {
  const extractor = new FakeExtractor(candidates);

  await assert.rejects(
    () => extractJobRequirements({ jobDescription: { text: "  " }, extractor }),
    (error: unknown) =>
      error instanceof InvalidJobDescriptionError && error.issue === "text must be a non-empty string",
  );
  assert.deepEqual(extractor.calls, []);
});

test("adds indexed context to malformed extracted requirements", async () => {
  const extractor = new FakeExtractor([
    candidates[0],
    { ...candidates[1], priority: "urgent" },
  ]);

  await assert.rejects(
    () => extractJobRequirements({ jobDescription: { text: "Backend role" }, extractor }),
    (error: unknown) =>
      error instanceof InvalidExtractedJobRequirementError &&
      error.index === 1 &&
      error.issue === "priority must be one of: low, medium, high, critical",
  );
});

test("rejects an invalid extracted preference through the canonical parser", async () => {
  const extractor = new FakeExtractor([{ ...candidates[0], preference: "optional" }]);

  await assert.rejects(
    () => extractJobRequirements({ jobDescription: { text: "Role" }, extractor }),
    (error: unknown) =>
      error instanceof InvalidExtractedJobRequirementError &&
      error.index === 0 &&
      error.issue === "preference must be one of: required, preferred",
  );
});

test("rejects malformed requirement types through the canonical parser", async () => {
  const extractor = new FakeExtractor([{ ...common, type: "salary", text: "Competitive salary" }]);

  await assert.rejects(
    () => extractJobRequirements({ jobDescription: { text: "Role" }, extractor }),
    (error: unknown) =>
      error instanceof InvalidExtractedJobRequirementError &&
      error.index === 0 &&
      error.issue === "type must be one of: skill, experience, education, certification, responsibility, domain-knowledge, language, location-work-arrangement",
  );
});

test("surfaces extractor invocation failures without converting validation failures", async () => {
  const extractor: JobRequirementExtractor = {
    async extract(): Promise<unknown> {
      throw new Error("provider unavailable");
    },
  };

  await assert.rejects(
    () => extractJobRequirements({ jobDescription: { text: "Role" }, extractor }),
    (error: unknown) =>
      error instanceof JobRequirementExtractorInvocationError &&
      error.cause instanceof Error &&
      error.cause.message === "provider unavailable",
  );
});
