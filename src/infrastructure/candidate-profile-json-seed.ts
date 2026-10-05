import { readFile } from "node:fs/promises";

import {
  saveCandidateProfile,
  type CandidateProfileRepository,
} from "../application/candidate-profile-repository.ts";
import { type CandidateProfile } from "../domain/candidate-profile.ts";

export type SeedCandidateProfileFromJsonFileInput = {
  readonly repository: CandidateProfileRepository;
  readonly filePath: string;
};

export class CandidateProfileSeedFileError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Candidate profile seed file error: ${issue}`);
    this.name = "CandidateProfileSeedFileError";
    this.issue = issue;
  }
}

/** Reads JSON only; profile validation and create-only persistence remain application concerns. */
export async function seedCandidateProfileFromJsonFile(
  input: SeedCandidateProfileFromJsonFileInput,
): Promise<CandidateProfile> {
  let source: string;
  try {
    source = await readFile(input.filePath, "utf8");
  } catch {
    throw new CandidateProfileSeedFileError(`could not read file: ${input.filePath}`);
  }

  let profile: unknown;
  try {
    profile = JSON.parse(source);
  } catch {
    throw new CandidateProfileSeedFileError("file contains invalid JSON");
  }

  return saveCandidateProfile(input.repository, profile);
}
