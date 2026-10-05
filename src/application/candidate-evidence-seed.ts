import {
  CandidateEvidenceValidationError,
  parseCandidateEvidence,
  type CandidateEvidence,
  type EvidenceId,
} from "../domain/candidate-evidence.ts";
import { type CandidateEvidenceRepository } from "./candidate-evidence-repository.ts";

export type SeedCandidateEvidenceInput = {
  readonly repository: CandidateEvidenceRepository;
  readonly records: unknown;
};

export class CandidateEvidenceSeedValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid candidate evidence seed: ${issue}`);
    this.name = "CandidateEvidenceSeedValidationError";
    this.issue = issue;
  }
}

/**
 * Validates the entire create-only payload before writing it sequentially in
 * input order. Repository failures can still leave earlier writes persisted.
 */
export async function seedCandidateEvidence(
  input: SeedCandidateEvidenceInput,
): Promise<readonly CandidateEvidence[]> {
  const evidence = validateSeedRecords(input.records);

  for (const item of evidence) {
    await input.repository.save(item);
  }

  return Object.freeze(evidence);
}

function validateSeedRecords(records: unknown): CandidateEvidence[] {
  if (!Array.isArray(records)) {
    invalid("records must be an array");
  }

  const evidence = records.map((record, index) => parseSeedRecord(record, index));
  const identifiers = new Set<EvidenceId>();
  for (const [index, item] of evidence.entries()) {
    if (identifiers.has(item.id)) {
      invalid(`record at index ${index} duplicates evidence id: ${item.id}`);
    }

    identifiers.add(item.id);
  }

  return evidence;
}

function parseSeedRecord(record: unknown, index: number): CandidateEvidence {
  try {
    return parseCandidateEvidence(record);
  } catch (error) {
    if (error instanceof CandidateEvidenceValidationError) {
      invalid(`record at index ${index} is invalid: ${error.issue}`);
    }

    throw error;
  }
}

function invalid(issue: string): never {
  throw new CandidateEvidenceSeedValidationError(issue);
}
