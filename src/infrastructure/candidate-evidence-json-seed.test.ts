import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { CandidateEvidenceSeedValidationError } from "../application/candidate-evidence-seed.ts";
import {
  CandidateEvidenceSeedFileError,
  seedCandidateEvidenceFromJsonFile,
} from "./candidate-evidence-json-seed.ts";
import { SqliteCandidateEvidenceRepository } from "./sqlite-candidate-evidence-repository.ts";

const provenance = {
  kind: "candidate-statement",
  statement: "Candidate confirmed this information.",
  recordedOn: "2026-10-04",
} as const;

const records = [
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
] as const;

async function withTemporaryJsonFile(
  contents: string,
  operation: (filePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "cv-generator-seed-"));
  const filePath = join(directory, "evidence.json");
  try {
    await writeFile(filePath, contents, "utf8");
    await operation(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("seeds decoded JSON into real SQLite storage in source order", async () => {
  const database = new Database(":memory:");
  const repository = new SqliteCandidateEvidenceRepository(database);

  await withTemporaryJsonFile(JSON.stringify(records), async (filePath) => {
    const seeded = await seedCandidateEvidenceFromJsonFile({ repository, filePath });
    assert.deepEqual(seeded.map((item) => item.id), records.map((item) => item.id));
  });

  assert.deepEqual(
    (await repository.list() as { id: string }[]).map((item) => item.id),
    records.map((item) => item.id),
  );
  database.close();
});

test("rejects malformed JSON without attempting candidate validation", async () => {
  const database = new Database(":memory:");
  const repository = new SqliteCandidateEvidenceRepository(database);

  await withTemporaryJsonFile("{", async (filePath) => {
    await assert.rejects(
      () => seedCandidateEvidenceFromJsonFile({ repository, filePath }),
      (error: unknown) =>
        error instanceof CandidateEvidenceSeedFileError && error.issue === "file contains invalid JSON",
    );
  });
  database.close();
});

test("propagates application validation after decoding JSON", async () => {
  const database = new Database(":memory:");
  const repository = new SqliteCandidateEvidenceRepository(database);

  await withTemporaryJsonFile(JSON.stringify([{ ...records[0], name: "" }]), async (filePath) => {
    await assert.rejects(
      () => seedCandidateEvidenceFromJsonFile({ repository, filePath }),
      CandidateEvidenceSeedValidationError,
    );
  });
  database.close();
});
