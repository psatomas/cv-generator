import {
  CandidateEvidenceValidationError,
  parseCandidateEvidence,
  type CandidateEvidence,
  type EvidenceId,
  type EvidenceType,
} from "./candidate-evidence.ts";

export class CandidateEvidenceCollectionValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid candidate evidence collection: ${issue}`);
    this.name = "CandidateEvidenceCollectionValidationError";
    this.issue = issue;
  }
}

/**
 * The collection preserves the parsed input order exactly. Type filtering
 * preserves the relative order of matching evidence items.
 */
export class CandidateEvidenceCollection {
  private readonly items: readonly CandidateEvidence[];

  private constructor(items: readonly CandidateEvidence[]) {
    this.items = items;
  }

  public static create(input: unknown): CandidateEvidenceCollection {
    if (!Array.isArray(input)) {
      invalid("items must be an array of candidate evidence");
    }

    if (input.length === 0) {
      invalid("items must contain at least one candidate evidence item");
    }

    const evidenceItems = input.map((item, index) => parseEvidenceItem(item, index));
    const ids = new Set<EvidenceId>();

    for (const evidence of evidenceItems) {
      if (ids.has(evidence.id)) {
        invalid(`duplicate evidence id: ${evidence.id}`);
      }

      ids.add(evidence.id);
    }

    return new CandidateEvidenceCollection(
      Object.freeze(evidenceItems.map((evidence) => freezeRecursively(evidence))),
    );
  }

  public all(): readonly CandidateEvidence[] {
    return Object.freeze([...this.items]);
  }

  public getById(id: EvidenceId): CandidateEvidence | undefined {
    return this.items.find((evidence) => evidence.id === id);
  }

  public getByType<T extends EvidenceType>(type: T): readonly Extract<CandidateEvidence, { type: T }>[] {
    return Object.freeze(
      this.items.filter((evidence) => evidence.type === type),
    ) as readonly Extract<CandidateEvidence, { type: T }>[];
  }
}

export function createCandidateEvidenceCollection(input: unknown): CandidateEvidenceCollection {
  return CandidateEvidenceCollection.create(input);
}

function parseEvidenceItem(input: unknown, index: number): CandidateEvidence {
  try {
    return parseCandidateEvidence(input);
  } catch (error) {
    if (error instanceof CandidateEvidenceValidationError) {
      invalid(`item at index ${index} is invalid: ${error.issue}`);
    }

    throw error;
  }
}

function freezeRecursively<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      freezeRecursively(child);
    }

    Object.freeze(value);
  }

  return value;
}

function invalid(issue: string): never {
  throw new CandidateEvidenceCollectionValidationError(issue);
}
