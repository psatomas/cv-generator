import { readFile } from "node:fs/promises";

import {
  seedCandidateEvidence,
} from "../application/candidate-evidence-seed.ts";
import { type CandidateEvidenceRepository } from "../application/candidate-evidence-repository.ts";
import { type CandidateEvidence } from "../domain/candidate-evidence.ts";

export type SeedCandidateEvidenceFromJsonFileInput = {
  readonly repository: CandidateEvidenceRepository;
  readonly filePath: string;
};

export class CandidateEvidenceSeedFileError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Candidate evidence seed file error: ${issue}`);
    this.name = "CandidateEvidenceSeedFileError";
    this.issue = issue;
  }
}

/** Reads JSON only; candidate evidence validation remains in the application boundary. */
export async function seedCandidateEvidenceFromJsonFile(
  input: SeedCandidateEvidenceFromJsonFileInput,
): Promise<readonly CandidateEvidence[]> {
  let source: string;
  try {
    source = await readFile(input.filePath, "utf8");
  } catch {
    throw new CandidateEvidenceSeedFileError(`could not read file: ${input.filePath}`);
  }

  let records: unknown;
  try {
    records = JSON.parse(source);
  } catch {
    throw new CandidateEvidenceSeedFileError("file contains invalid JSON");
  }

  return seedCandidateEvidence({ repository: input.repository, records });
}
