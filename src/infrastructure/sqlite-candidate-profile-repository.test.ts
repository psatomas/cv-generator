import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  CandidateProfileAlreadyExistsError,
  CandidateProfileNotFoundError,
  InvalidPersistedCandidateProfileError,
  getCandidateProfile,
} from "../application/candidate-profile-repository.ts";
import { parseCandidateProfile } from "../domain/candidate-profile.ts";
import {
  initializeCandidateProfileSqliteSchema,
  SqliteCandidateProfilePayloadError,
  SqliteCandidateProfileRepository,
} from "./sqlite-candidate-profile-repository.ts";

const profile = parseCandidateProfile({
  fullName: "Alex Example",
  professionalTitle: "Protocol Engineer",
  email: "alex@example.com",
  githubUrl: "https://github.com/example",
  linkedinUrl: "https://www.linkedin.com/in/example",
  websiteUrl: "https://example.dev",
});

function createRepository() {
  const database = new Database(":memory:");
  return { database, repository: new SqliteCandidateProfileRepository(database) };
}

test("initializes the singleton schema idempotently", () => {
  const database = new Database(":memory:");
  initializeCandidateProfileSqliteSchema(database);
  initializeCandidateProfileSqliteSchema(database);

  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'candidate_profile'")
    .get() as { name: string } | undefined;
  assert.equal(table?.name, "candidate_profile");
  database.close();
});

test("returns missing profiles and round-trips raw canonical profile JSON", async () => {
  const { database, repository } = createRepository();
  assert.equal(await repository.get(), undefined);

  await repository.save(profile);
  assert.deepEqual(await repository.get(), JSON.parse(JSON.stringify(profile)));
  assert.deepEqual(await getCandidateProfile(repository), profile);
  database.close();
});

test("implements create-only save and replace-only update semantics", async () => {
  const { database, repository } = createRepository();

  await assert.rejects(() => repository.replace(profile), CandidateProfileNotFoundError);
  await repository.save(profile);
  await assert.rejects(() => repository.save(profile), CandidateProfileAlreadyExistsError);

  const replacement = parseCandidateProfile({ ...profile, location: "Recife, Brazil" });
  await repository.replace(replacement);
  assert.deepEqual(await repository.get(), JSON.parse(JSON.stringify(replacement)));
  assert.deepEqual(await getCandidateProfile(repository), replacement);
  database.close();
});

test("distinguishes malformed JSON from valid JSON with an invalid profile shape", async () => {
  const { database, repository } = createRepository();
  database
    .prepare("INSERT INTO candidate_profile (singleton_id, payload) VALUES (1, ?)")
    .run("{");
  await assert.rejects(() => repository.get(), SqliteCandidateProfilePayloadError);

  database.prepare("DELETE FROM candidate_profile").run();
  database
    .prepare("INSERT INTO candidate_profile (singleton_id, payload) VALUES (1, ?)")
    .run(JSON.stringify({}));
  assert.deepEqual(await repository.get(), {});
  await assert.rejects(() => getCandidateProfile(repository), InvalidPersistedCandidateProfileError);
  database.close();
});
