import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  CandidateProfileAlreadyExistsError,
  getCandidateProfile,
} from "../application/candidate-profile-repository.ts";
import { CandidateProfileValidationError, parseCandidateProfile } from "../domain/candidate-profile.ts";
import {
  CandidateProfileSeedFileError,
  seedCandidateProfileFromJsonFile,
} from "./candidate-profile-json-seed.ts";
import { SqliteCandidateProfileRepository } from "./sqlite-candidate-profile-repository.ts";

async function withTemporaryJsonFile(
  contents: string,
  operation: (filePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "cv-generator-profile-"));
  const filePath = join(directory, "profile.json");
  try {
    await writeFile(filePath, contents, "utf8");
    await operation(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("seeds the real candidate profile data into SQLite through the application boundary", async () => {
  const source = await readFile("data/candidate-profile.json", "utf8");
  const rawProfile: unknown = JSON.parse(source);
  const database = new Database(":memory:");
  const repository = new SqliteCandidateProfileRepository(database);

  const seeded = await seedCandidateProfileFromJsonFile({
    repository,
    filePath: "data/candidate-profile.json",
  });
  const persisted = await getCandidateProfile(repository);

  assert.deepEqual(seeded, parseCandidateProfile(rawProfile));
  assert.deepEqual(persisted, parseCandidateProfile(rawProfile));
  assert.deepEqual(JSON.parse(JSON.stringify(seeded)), rawProfile);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(seeded))).sort(), [
    "fullName",
    "githubUrl",
    "location",
    "professionalTitle",
    "websiteUrl",
  ]);
  database.close();
});

test("rejects unreadable and malformed JSON files with focused file errors", async () => {
  const database = new Database(":memory:");
  const repository = new SqliteCandidateProfileRepository(database);

  await assert.rejects(
    () => seedCandidateProfileFromJsonFile({ repository, filePath: "data/missing-profile.json" }),
    (error: unknown) =>
      error instanceof CandidateProfileSeedFileError &&
      error.issue === "could not read file: data/missing-profile.json",
  );
  await withTemporaryJsonFile("{", async (filePath) => {
    await assert.rejects(
      () => seedCandidateProfileFromJsonFile({ repository, filePath }),
      (error: unknown) =>
        error instanceof CandidateProfileSeedFileError && error.issue === "file contains invalid JSON",
    );
  });
  database.close();
});

test("propagates validation and create-only repository errors unchanged", async () => {
  const database = new Database(":memory:");
  const repository = new SqliteCandidateProfileRepository(database);

  await withTemporaryJsonFile(JSON.stringify({ fullName: " " }), async (filePath) => {
    await assert.rejects(
      () => seedCandidateProfileFromJsonFile({ repository, filePath }),
      CandidateProfileValidationError,
    );
  });
  await withTemporaryJsonFile(JSON.stringify({ fullName: "Alex Example" }), async (filePath) => {
    await seedCandidateProfileFromJsonFile({ repository, filePath });
    await assert.rejects(
      () => seedCandidateProfileFromJsonFile({ repository, filePath }),
      CandidateProfileAlreadyExistsError,
    );
  });
  database.close();
});
