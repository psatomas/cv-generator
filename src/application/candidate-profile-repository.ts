import {
  CandidateProfileValidationError,
  parseCandidateProfile,
  type CandidateProfile,
} from "../domain/candidate-profile.ts";

/** Storage-neutral singleton profile contract. Reads remain raw until revalidated here. */
export interface CandidateProfileRepository {
  get(): Promise<unknown | undefined>;
  save(profile: CandidateProfile): Promise<void>;
  replace(profile: CandidateProfile): Promise<void>;
}

export class CandidateProfileAlreadyExistsError extends Error {
  constructor() {
    super("Candidate profile already exists");
    this.name = "CandidateProfileAlreadyExistsError";
  }
}

export class CandidateProfileNotFoundError extends Error {
  constructor() {
    super("Candidate profile was not found");
    this.name = "CandidateProfileNotFoundError";
  }
}

export class InvalidPersistedCandidateProfileError extends Error {
  public readonly issue: string;
  public readonly cause: CandidateProfileValidationError;

  constructor(issue: string, cause: CandidateProfileValidationError) {
    super(`Invalid persisted candidate profile: ${issue}`);
    this.name = "InvalidPersistedCandidateProfileError";
    this.issue = issue;
    this.cause = cause;
  }
}

export async function getCandidateProfile(
  repository: CandidateProfileRepository,
): Promise<CandidateProfile | undefined> {
  const record = await repository.get();
  return record === undefined ? undefined : parseStoredProfile(record);
}

export async function saveCandidateProfile(
  repository: CandidateProfileRepository,
  input: unknown,
): Promise<CandidateProfile> {
  const profile = parseCandidateProfile(input);
  await repository.save(profile);
  return profile;
}

export async function replaceCandidateProfile(
  repository: CandidateProfileRepository,
  input: unknown,
): Promise<CandidateProfile> {
  const profile = parseCandidateProfile(input);
  await repository.replace(profile);
  return profile;
}

function parseStoredProfile(record: unknown): CandidateProfile {
  try {
    return parseCandidateProfile(record);
  } catch (error) {
    if (error instanceof CandidateProfileValidationError) {
      throw new InvalidPersistedCandidateProfileError(error.issue, error);
    }

    throw error;
  }
}
