import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateProfileAlreadyExistsError,
  CandidateProfileNotFoundError,
  InvalidPersistedCandidateProfileError,
  getCandidateProfile,
  replaceCandidateProfile,
  saveCandidateProfile,
  type CandidateProfileRepository,
} from "./candidate-profile-repository.ts";
import {
  CandidateProfileValidationError,
  parseCandidateProfile,
  type CandidateProfile,
} from "../domain/candidate-profile.ts";

class RecordingCandidateProfileRepository implements CandidateProfileRepository {
  public record: unknown | undefined;
  public saveCalls = 0;
  public replaceCalls = 0;

  public async get(): Promise<unknown | undefined> {
    return this.record;
  }

  public async save(profile: CandidateProfile): Promise<void> {
    this.saveCalls += 1;
    if (this.record !== undefined) {
      throw new CandidateProfileAlreadyExistsError();
    }

    this.record = profile;
  }

  public async replace(profile: CandidateProfile): Promise<void> {
    this.replaceCalls += 1;
    if (this.record === undefined) {
      throw new CandidateProfileNotFoundError();
    }

    this.record = profile;
  }
}

const profile = {
  fullName: "Alex Example",
  email: "alex@example.com",
  githubUrl: "https://github.com/example",
};

test("returns undefined for a missing profile and revalidates stored profiles", async () => {
  const repository = new RecordingCandidateProfileRepository();
  assert.equal(await getCandidateProfile(repository), undefined);

  repository.record = profile;
  assert.deepEqual(await getCandidateProfile(repository), parseCandidateProfile(profile));
});

test("rejects invalid persisted profile data through the application boundary", async () => {
  const repository = new RecordingCandidateProfileRepository();
  repository.record = { fullName: " " };

  await assert.rejects(
    () => getCandidateProfile(repository),
    (error: unknown) =>
      error instanceof InvalidPersistedCandidateProfileError &&
      error.issue === "fullName must be a non-empty string" &&
      error.cause instanceof CandidateProfileValidationError,
  );
});

test("canonicalizes save and replace inputs before calling the repository", async () => {
  const repository = new RecordingCandidateProfileRepository();

  const saved = await saveCandidateProfile(repository, { fullName: " Alex Example ", email: " alex@example.com " });
  assert.deepEqual(saved, { fullName: "Alex Example", email: "alex@example.com", professionalTitle: undefined, location: undefined, phone: undefined, githubUrl: undefined, linkedinUrl: undefined, websiteUrl: undefined });
  assert.deepEqual(repository.record, saved);

  const replaced = await replaceCandidateProfile(repository, { fullName: " Alex Example ", location: " Recife " });
  assert.equal(replaced.fullName, "Alex Example");
  assert.equal(replaced.location, "Recife");
  assert.equal(repository.saveCalls, 1);
  assert.equal(repository.replaceCalls, 1);
});

test("rejects invalid save and replace inputs before repository calls", async () => {
  const repository = new RecordingCandidateProfileRepository();

  await assert.rejects(
    () => saveCandidateProfile(repository, { fullName: " " }),
    CandidateProfileValidationError,
  );
  await assert.rejects(
    () => replaceCandidateProfile(repository, { fullName: " " }),
    CandidateProfileValidationError,
  );
  assert.equal(repository.saveCalls, 0);
  assert.equal(repository.replaceCalls, 0);
});

test("propagates create-only and replace-only repository errors unchanged", async () => {
  const repository = new RecordingCandidateProfileRepository();
  await saveCandidateProfile(repository, profile);

  await assert.rejects(
    () => saveCandidateProfile(repository, profile),
    CandidateProfileAlreadyExistsError,
  );

  const emptyRepository = new RecordingCandidateProfileRepository();
  await assert.rejects(
    () => replaceCandidateProfile(emptyRepository, profile),
    CandidateProfileNotFoundError,
  );
});
