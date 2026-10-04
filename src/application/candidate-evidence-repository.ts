import {
  CandidateEvidenceValidationError,
  parseCandidateEvidence,
  type CandidateEvidence,
  type EvidenceId,
} from "../domain/candidate-evidence.ts";
import {
  createCandidateEvidenceCollection,
  type CandidateEvidenceCollection,
} from "../domain/candidate-evidence-collection.ts";

/**
 * Storage technology contract for canonical candidate evidence. Reads return
 * raw records so the boundary can revalidate them before they enter the domain.
 */
export interface CandidateEvidenceRepository {
  list(): Promise<readonly unknown[]>;
  getById(id: EvidenceId): Promise<unknown | undefined>;
  save(evidence: CandidateEvidence): Promise<void>;
  replace(evidence: CandidateEvidence): Promise<void>;
  delete(id: EvidenceId): Promise<void>;
}

export class CandidateEvidenceAlreadyExistsError extends Error {
  public readonly id: EvidenceId;

  constructor(id: EvidenceId) {
    super(`Candidate evidence already exists: ${id}`);
    this.name = "CandidateEvidenceAlreadyExistsError";
    this.id = id;
  }
}

export class CandidateEvidenceNotFoundError extends Error {
  public readonly id: EvidenceId;

  constructor(id: EvidenceId) {
    super(`Candidate evidence was not found: ${id}`);
    this.name = "CandidateEvidenceNotFoundError";
    this.id = id;
  }
}

export class InvalidPersistedCandidateEvidenceError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid persisted candidate evidence: ${issue}`);
    this.name = "InvalidPersistedCandidateEvidenceError";
    this.issue = issue;
  }
}

export async function listCandidateEvidence(
  repository: CandidateEvidenceRepository,
): Promise<readonly CandidateEvidence[]> {
  const records = await repository.list();
  return records.map((record, index) => parseStoredEvidence(record, `record at index ${index}`));
}

export async function getCandidateEvidence(
  repository: CandidateEvidenceRepository,
  id: EvidenceId,
): Promise<CandidateEvidence | undefined> {
  const record = await repository.getById(id);
  return record === undefined ? undefined : parseStoredEvidence(record, `record for ${id}`);
}

export async function saveCandidateEvidence(
  repository: CandidateEvidenceRepository,
  input: unknown,
): Promise<CandidateEvidence> {
  const evidence = parseCandidateEvidence(input);
  await repository.save(evidence);
  return evidence;
}

export async function replaceCandidateEvidence(
  repository: CandidateEvidenceRepository,
  input: unknown,
): Promise<CandidateEvidence> {
  const evidence = parseCandidateEvidence(input);
  await repository.replace(evidence);
  return evidence;
}

export async function deleteCandidateEvidence(
  repository: CandidateEvidenceRepository,
  id: EvidenceId,
): Promise<void> {
  await repository.delete(id);
}

export async function reconstructCandidateEvidenceCollection(
  repository: CandidateEvidenceRepository,
): Promise<CandidateEvidenceCollection> {
  return createCandidateEvidenceCollection(await listCandidateEvidence(repository));
}

function parseStoredEvidence(record: unknown, context: string): CandidateEvidence {
  try {
    return parseCandidateEvidence(record);
  } catch (error) {
    if (error instanceof CandidateEvidenceValidationError) {
      throw new InvalidPersistedCandidateEvidenceError(`${context} is invalid: ${error.issue}`);
    }

    throw error;
  }
}
