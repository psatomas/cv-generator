import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateEvidenceAlreadyExistsError,
  CandidateEvidenceNotFoundError,
  InvalidPersistedCandidateEvidenceError,
  deleteCandidateEvidence,
  getCandidateEvidence,
  listCandidateEvidence,
  reconstructCandidateEvidenceCollection,
  replaceCandidateEvidence,
  saveCandidateEvidence,
  type CandidateEvidenceRepository,
} from "./candidate-evidence-repository.ts";
import type { CandidateEvidence, EvidenceId } from "../domain/candidate-evidence.ts";

class InMemoryCandidateEvidenceRepository implements CandidateEvidenceRepository {
  private readonly records = new Map<EvidenceId, unknown>();

  public async list(): Promise<readonly unknown[]> {
    return [...this.records.values()];
  }

  public async getById(id: EvidenceId): Promise<unknown | undefined> {
    return this.records.get(id);
  }

  public async save(evidence: CandidateEvidence): Promise<void> {
    if (this.records.has(evidence.id)) {
      throw new CandidateEvidenceAlreadyExistsError(evidence.id);
    }

    this.records.set(evidence.id, structuredClone(evidence));
  }

  public async replace(evidence: CandidateEvidence): Promise<void> {
    if (!this.records.has(evidence.id)) {
      throw new CandidateEvidenceNotFoundError(evidence.id);
    }

    this.records.set(evidence.id, structuredClone(evidence));
  }

  public async delete(id: EvidenceId): Promise<void> {
    if (!this.records.delete(id)) {
      throw new CandidateEvidenceNotFoundError(id);
    }
  }

  public corrupt(id: EvidenceId, value: unknown): void {
    this.records.set(id, value);
  }
}

const skillEvidence = {
  id: "evidence_skill_typescript",
  type: "skill",
  provenance: {
    kind: "candidate-statement",
    statement: "Candidate confirmed this information.",
    recordedOn: "2026-10-04",
  },
  name: "TypeScript",
  level: "advanced",
} as const;

const projectEvidence = {
  id: "evidence_project_protocol",
  type: "project",
  provenance: {
    kind: "candidate-statement",
    statement: "Candidate confirmed this information.",
    recordedOn: "2026-10-04",
  },
  name: "Protocol Explorer",
  technologies: ["TypeScript"],
  highlights: ["Implemented protocol monitoring."],
} as const;

test("stores, retrieves, lists, and reconstructs canonical evidence", async () => {
  const repository = new InMemoryCandidateEvidenceRepository();
  await saveCandidateEvidence(repository, skillEvidence);
  await saveCandidateEvidence(repository, projectEvidence);

  assert.equal((await getCandidateEvidence(repository, skillEvidence.id))?.id, skillEvidence.id);
  assert.deepEqual(
    (await listCandidateEvidence(repository)).map((evidence) => evidence.id),
    [skillEvidence.id, projectEvidence.id],
  );
  assert.deepEqual(
    (await reconstructCandidateEvidenceCollection(repository)).all().map((evidence) => evidence.id),
    [skillEvidence.id, projectEvidence.id],
  );
});

test("keeps create and replace semantics explicit", async () => {
  const repository = new InMemoryCandidateEvidenceRepository();
  await saveCandidateEvidence(repository, skillEvidence);

  await assert.rejects(
    () => saveCandidateEvidence(repository, skillEvidence),
    CandidateEvidenceAlreadyExistsError,
  );
  await assert.rejects(
    () => replaceCandidateEvidence(repository, projectEvidence),
    CandidateEvidenceNotFoundError,
  );

  await replaceCandidateEvidence(repository, { ...skillEvidence, level: "expert" });
  const storedEvidence = await getCandidateEvidence(repository, skillEvidence.id);
  assert.ok(storedEvidence && storedEvidence.type === "skill");
  assert.equal(storedEvidence.level, "expert");
});

test("deletes evidence intentionally and rejects missing records", async () => {
  const repository = new InMemoryCandidateEvidenceRepository();
  await saveCandidateEvidence(repository, skillEvidence);

  await deleteCandidateEvidence(repository, skillEvidence.id);
  assert.equal(await getCandidateEvidence(repository, skillEvidence.id), undefined);
  await assert.rejects(
    () => deleteCandidateEvidence(repository, skillEvidence.id),
    CandidateEvidenceNotFoundError,
  );
});

test("rejects corrupted persisted evidence before it enters the domain", async () => {
  const repository = new InMemoryCandidateEvidenceRepository();
  repository.corrupt(skillEvidence.id, { ...skillEvidence, name: "" });

  await assert.rejects(
    () => getCandidateEvidence(repository, skillEvidence.id),
    (error: unknown) =>
      error instanceof InvalidPersistedCandidateEvidenceError &&
      error.issue === `record for ${skillEvidence.id} is invalid: name must be a non-empty string`,
  );
  await assert.rejects(
    () => reconstructCandidateEvidenceCollection(repository),
    InvalidPersistedCandidateEvidenceError,
  );
});
