import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateEvidenceAlreadyExistsError,
  type CandidateEvidenceRepository,
} from "./candidate-evidence-repository.ts";
import {
  CandidateEvidenceSeedValidationError,
  seedCandidateEvidence,
} from "./candidate-evidence-seed.ts";
import type { CandidateEvidence, EvidenceId } from "../domain/candidate-evidence.ts";

class RecordingCandidateEvidenceRepository implements CandidateEvidenceRepository {
  public readonly saved: CandidateEvidence[] = [];
  public replaceCalls = 0;
  private readonly existingIds: ReadonlySet<EvidenceId>;

  constructor(existingIds: readonly EvidenceId[] = []) {
    this.existingIds = new Set(existingIds);
  }

  public async list(): Promise<readonly unknown[]> {
    return this.saved;
  }

  public async getById(): Promise<unknown | undefined> {
    return undefined;
  }

  public async save(evidence: CandidateEvidence): Promise<void> {
    if (this.existingIds.has(evidence.id)) {
      throw new CandidateEvidenceAlreadyExistsError(evidence.id);
    }

    this.saved.push(evidence);
  }

  public async replace(): Promise<void> {
    this.replaceCalls += 1;
  }

  public async delete(): Promise<void> {
    throw new Error("not used by candidate evidence seeding");
  }
}

const provenance = {
  kind: "candidate-statement",
  statement: "Candidate confirmed this information.",
  recordedOn: "2026-10-04",
} as const;

const records = [
  {
    id: "evidence_experience_acme",
    type: "professional-experience",
    provenance,
    employer: "Acme",
    role: "Engineer",
    startDate: "2022-01",
    highlights: ["Built a platform."],
  },
  {
    id: "evidence_project_protocol",
    type: "project",
    provenance,
    name: "Protocol Explorer",
    technologies: ["TypeScript"],
    highlights: ["Implemented monitoring."],
  },
  {
    id: "evidence_education_degree",
    type: "education",
    provenance,
    institution: "Example University",
    qualification: "BSc Computer Science",
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
] as const;

test("validates and persists every evidence variant sequentially in input order", async () => {
  const repository = new RecordingCandidateEvidenceRepository();

  const result = await seedCandidateEvidence({ repository, records });

  assert.deepEqual(result.map((item) => item.id), records.map((item) => item.id));
  assert.deepEqual(repository.saved.map((item) => item.id), records.map((item) => item.id));
  assert.equal(repository.replaceCalls, 0);
});

test("allows an empty payload as a validated no-op", async () => {
  const repository = new RecordingCandidateEvidenceRepository();

  assert.deepEqual(await seedCandidateEvidence({ repository, records: [] }), []);
  assert.deepEqual(repository.saved, []);
});

test("rejects malformed payloads before any repository save", async () => {
  const repository = new RecordingCandidateEvidenceRepository();

  await assert.rejects(
    () => seedCandidateEvidence({ repository, records: {} }),
    (error: unknown) =>
      error instanceof CandidateEvidenceSeedValidationError && error.issue === "records must be an array",
  );
  await assert.rejects(
    () => seedCandidateEvidence({ repository, records: [{ ...records[0], role: "" }] }),
    (error: unknown) =>
      error instanceof CandidateEvidenceSeedValidationError &&
      error.issue === "record at index 0 is invalid: role must be a non-empty string",
  );
  await assert.rejects(
    () => seedCandidateEvidence({ repository, records: [records[0], records[0]] }),
    (error: unknown) =>
      error instanceof CandidateEvidenceSeedValidationError &&
      error.issue === `record at index 1 duplicates evidence id: ${records[0].id}`,
  );
  assert.deepEqual(repository.saved, []);
});

test("propagates existing repository duplicate errors without replacing evidence", async () => {
  const repository = new RecordingCandidateEvidenceRepository([records[0].id]);

  await assert.rejects(
    () => seedCandidateEvidence({ repository, records: [records[0]] }),
    CandidateEvidenceAlreadyExistsError,
  );
  assert.deepEqual(repository.saved, []);
  assert.equal(repository.replaceCalls, 0);
});
