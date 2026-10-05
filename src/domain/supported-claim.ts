import { isEvidenceId, type EvidenceId } from "./candidate-evidence.ts";
import { isJobRequirementId, type JobRequirementId } from "./job-requirement.ts";

export type SupportedClaimId = `claim_${string}`;

export type SupportedClaim = Readonly<{
  id: SupportedClaimId;
  text: string;
  requirementId: JobRequirementId;
  evidenceIds: readonly [EvidenceId, ...EvidenceId[]];
}>;

export class SupportedClaimValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid supported claim: ${issue}`);
    this.name = "SupportedClaimValidationError";
    this.issue = issue;
  }
}

type UnknownRecord = Record<string, unknown>;

const idPattern = /^claim_[a-z0-9][a-z0-9_-]*$/;

export function isSupportedClaimId(value: string): value is SupportedClaimId {
  return idPattern.test(value);
}

export function parseSupportedClaim(input: unknown): SupportedClaim {
  const claim = asRecord(input, "claim");
  const evidenceIds = evidenceReferences(claim.evidenceIds);

  return Object.freeze({
    id: claimId(claim.id),
    text: text(claim.text, "text"),
    requirementId: requirementReference(claim.requirementId),
    evidenceIds: Object.freeze([...evidenceIds]) as readonly [EvidenceId, ...EvidenceId[]],
  });
}

function asRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${field} must be an object`);
  }

  return value as UnknownRecord;
}

function claimId(value: unknown): SupportedClaimId {
  const id = text(value, "id");
  if (!isSupportedClaimId(id)) {
    invalid("id must use the claim_<lowercase-identifier> format");
  }

  return id;
}

function requirementReference(value: unknown): JobRequirementId {
  const id = text(value, "requirementId");
  if (!isJobRequirementId(id)) {
    invalid("requirementId must use the requirement_<lowercase-identifier> format");
  }

  return id;
}

function evidenceReferences(value: unknown): EvidenceId[] {
  if (!Array.isArray(value)) {
    invalid("evidenceIds must be an array of evidence identifiers");
  }
  if (value.length === 0) {
    invalid("evidenceIds must contain at least one evidence identifier");
  }

  const ids = value.map((item, index) => evidenceReference(item, index));
  if (new Set(ids).size !== ids.length) {
    invalid("evidenceIds must not contain duplicates");
  }

  return ids;
}

function evidenceReference(value: unknown, index: number): EvidenceId {
  const id = text(value, `evidenceIds[${index}]`);
  if (!isEvidenceId(id)) {
    invalid(`evidenceIds[${index}] must use the evidence_<lowercase-identifier> format`);
  }

  return id;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function invalid(issue: string): never {
  throw new SupportedClaimValidationError(issue);
}
