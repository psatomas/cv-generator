import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Database from "better-sqlite3";

import { seedCandidateEvidence } from "../application/candidate-evidence-seed.ts";
import { SqliteCandidateEvidenceRepository } from "./sqlite-candidate-evidence-repository.ts";

test("seeds the initial candidate evidence dataset into SQLite in source order", async () => {
  const records: unknown = JSON.parse(
    await readFile("data/candidate-evidence.json", "utf8"),
  );
  assert.ok(Array.isArray(records));

  const database = new Database(":memory:");
  const repository = new SqliteCandidateEvidenceRepository(database);
  const seeded = await seedCandidateEvidence({ repository, records });
  const persisted = await repository.list();

  assert.equal(new Set(seeded.map((item) => item.id)).size, seeded.length);
  assert.deepEqual(
    persisted.map((item) => (item as { id: string }).id),
    seeded.map((item) => item.id),
  );
  assert.deepEqual(
    persisted.map((item) => (item as { id: string }).id),
    records.map((item) => (item as { id: string }).id),
  );
  database.close();
});
