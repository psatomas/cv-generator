import { CandidateEvidenceCollection } from "./candidate-evidence-collection.ts";
import { type EvidenceId } from "./candidate-evidence.ts";
import { JobRequirementCollection } from "./job-requirement-collection.ts";
import { type JobRequirementId } from "./job-requirement.ts";
import {
  SupportedClaimValidationError,
  parseSupportedClaim,
  type SupportedClaim,
  type SupportedClaimId,
} from "./supported-claim.ts";

export class SupportedClaimCollectionValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid supported claim collection: ${issue}`);
    this.name = "SupportedClaimCollectionValidationError";
    this.issue = issue;
  }
}

type ClaimCollectionInput = {
  evidence: CandidateEvidenceCollection;
  requirements: JobRequirementCollection;
  claims: readonly unknown[];
};

/**
 * The collection preserves parsed claim input order. Empty collections are
 * valid because a job analysis may establish no supported claims.
 */
export class SupportedClaimCollection {
  private readonly claims: readonly SupportedClaim[];

  private constructor(claims: readonly SupportedClaim[]) {
    this.claims = claims;
  }

  public static create(input: unknown): SupportedClaimCollection {
    const collectionInput = asInput(input);
    const claims = parseClaims(collectionInput.claims);
    const ids = new Set<SupportedClaimId>();

    for (const claim of claims) {
      if (ids.has(claim.id)) {
        invalid(`duplicate claim id: ${claim.id}`);
      }
      if (collectionInput.requirements.getById(claim.requirementId) === undefined) {
        invalid(`unknown requirement id: ${claim.requirementId}`);
      }
      for (const evidenceId of claim.evidenceIds) {
        ensureEvidenceExists(collectionInput.evidence, evidenceId);
      }

      ids.add(claim.id);
    }

    return new SupportedClaimCollection(Object.freeze([...claims]));
  }

  public all(): readonly SupportedClaim[] {
    return Object.freeze([...this.claims]);
  }

  public getById(id: SupportedClaimId): SupportedClaim | undefined {
    return this.claims.find((claim) => claim.id === id);
  }

  public getByRequirementId(requirementId: JobRequirementId): readonly SupportedClaim[] {
    return Object.freeze(this.claims.filter((claim) => claim.requirementId === requirementId));
  }
}

export function createSupportedClaimCollection(input: unknown): SupportedClaimCollection {
  return SupportedClaimCollection.create(input);
}

function asInput(input: unknown): ClaimCollectionInput {
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
  if (!Array.isArray(value.claims)) {
    invalid("claims must be an array of supported claims");
  }

  return {
    evidence: value.evidence,
    requirements: value.requirements,
    claims: value.claims,
  };
}

function parseClaims(input: readonly unknown[]): SupportedClaim[] {
  return input.map((claim, index) => {
    try {
      return parseSupportedClaim(claim);
    } catch (error) {
      if (error instanceof SupportedClaimValidationError) {
        invalid(`claim at index ${index} is invalid: ${error.issue}`);
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

function invalid(issue: string): never {
  throw new SupportedClaimCollectionValidationError(issue);
}
