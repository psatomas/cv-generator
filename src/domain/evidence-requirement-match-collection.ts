import {
  CandidateEvidenceCollection,
} from "./candidate-evidence-collection.ts";
import { type EvidenceId } from "./candidate-evidence.ts";
import {
  EvidenceRequirementMatchValidationError,
  parseEvidenceRequirementMatch,
  type EvidenceRequirementMatch,
  type EvidenceRequirementMatchId,
  type EvidenceRequirementMatchOutcome,
} from "./evidence-requirement-match.ts";
import {
  JobRequirementCollection,
} from "./job-requirement-collection.ts";
import { type JobRequirementId } from "./job-requirement.ts";

export class EvidenceRequirementMatchCollectionValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid evidence requirement match collection: ${issue}`);
    this.name = "EvidenceRequirementMatchCollectionValidationError";
    this.issue = issue;
  }
}

type MatchCollectionInput = {
  evidence: CandidateEvidenceCollection;
  requirements: JobRequirementCollection;
  matches: readonly unknown[];
};

/**
 * The collection preserves parsed match input order exactly. Outcome filtering
 * preserves the relative order of matching items. Empty match sets are valid
 * because requirement coverage is intentionally optional at this stage.
 */
export class EvidenceRequirementMatchCollection {
  private readonly matches: readonly EvidenceRequirementMatch[];

  private constructor(matches: readonly EvidenceRequirementMatch[]) {
    this.matches = matches;
  }

  public static create(input: unknown): EvidenceRequirementMatchCollection {
    const collectionInput = asInput(input);
    const matches = parseMatches(collectionInput);
    const matchIds = new Set<EvidenceRequirementMatchId>();
    const requirementIds = new Set<JobRequirementId>();

    for (const match of matches) {
      if (matchIds.has(match.id)) {
        invalid(`duplicate match id: ${match.id}`);
      }
      if (requirementIds.has(match.requirementId)) {
        invalid(`duplicate requirement coverage: ${match.requirementId}`);
      }
      if (collectionInput.requirements.getById(match.requirementId) === undefined) {
        invalid(`unknown requirement id: ${match.requirementId}`);
      }

      for (const evidenceId of match.evidenceIds) {
        ensureEvidenceExists(collectionInput.evidence, evidenceId);
      }

      matchIds.add(match.id);
      requirementIds.add(match.requirementId);
    }

    return new EvidenceRequirementMatchCollection(
      Object.freeze(matches.map((match) => freezeRecursively(match))),
    );
  }

  public all(): readonly EvidenceRequirementMatch[] {
    return Object.freeze([...this.matches]);
  }

  public getById(id: EvidenceRequirementMatchId): EvidenceRequirementMatch | undefined {
    return this.matches.find((match) => match.id === id);
  }

  public getByRequirementId(requirementId: JobRequirementId): EvidenceRequirementMatch | undefined {
    return this.matches.find((match) => match.requirementId === requirementId);
  }

  public getByOutcome<T extends EvidenceRequirementMatchOutcome>(
    outcome: T,
  ): readonly Extract<EvidenceRequirementMatch, { outcome: T }>[] {
    return Object.freeze(
      this.matches.filter((match) => match.outcome === outcome),
    ) as readonly Extract<EvidenceRequirementMatch, { outcome: T }>[];
  }
}

export function createEvidenceRequirementMatchCollection(
  input: unknown,
): EvidenceRequirementMatchCollection {
  return EvidenceRequirementMatchCollection.create(input);
}

function asInput(input: unknown): MatchCollectionInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    invalid("input must be an object");
  }

  const value = input as Record<string, unknown>;
  if (!(value.evidence instanceof CandidateEvidenceCollection)) {
    invalid("evidence must be a CandidateEvidenceCollection");
  }
  if (!(value.requirements instanceof JobRequirementCollection)) {
    invalid("requirements must be a JobRequirementCollection");
  }
  if (!Array.isArray(value.matches)) {
    invalid("matches must be an array of evidence requirement matches");
  }

  return {
    evidence: value.evidence,
    requirements: value.requirements,
    matches: value.matches,
  };
}

function parseMatches(input: MatchCollectionInput): EvidenceRequirementMatch[] {
  return input.matches.map((match, index) => {
    try {
      return parseEvidenceRequirementMatch(match);
    } catch (error) {
      if (error instanceof EvidenceRequirementMatchValidationError) {
        invalid(`match at index ${index} is invalid: ${error.issue}`);
      }

      throw error;
    }
  });
}

function ensureEvidenceExists(collection: CandidateEvidenceCollection, id: EvidenceId): void {
  if (collection.getById(id) === undefined) {
    invalid(`unknown evidence id: ${id}`);
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
  throw new EvidenceRequirementMatchCollectionValidationError(issue);
}
