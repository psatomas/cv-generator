import { isEvidenceId, type EvidenceId } from "./candidate-evidence.ts";
import { isJobRequirementId, type JobRequirementId } from "./job-requirement.ts";

export const evidenceRequirementMatchOutcomes = [
  "supported",
  "partially-supported",
  "unsupported",
] as const;

export type EvidenceRequirementMatchOutcome = (typeof evidenceRequirementMatchOutcomes)[number];
export type EvidenceRequirementMatchId = `match_${string}`;

type EvidenceRequirementMatchBase = {
  id: EvidenceRequirementMatchId;
  requirementId: JobRequirementId;
  explanation: string;
};

export type SupportedEvidenceRequirementMatch = EvidenceRequirementMatchBase & {
  outcome: "supported";
  evidenceIds: readonly [EvidenceId, ...EvidenceId[]];
};

export type PartiallySupportedEvidenceRequirementMatch = EvidenceRequirementMatchBase & {
  outcome: "partially-supported";
  evidenceIds: readonly [EvidenceId, ...EvidenceId[]];
};

export type UnsupportedEvidenceRequirementMatch = EvidenceRequirementMatchBase & {
  outcome: "unsupported";
  evidenceIds: readonly [];
};

export type EvidenceRequirementMatch =
  | SupportedEvidenceRequirementMatch
  | PartiallySupportedEvidenceRequirementMatch
  | UnsupportedEvidenceRequirementMatch;

export class EvidenceRequirementMatchValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid evidence requirement match: ${issue}`);
    this.name = "EvidenceRequirementMatchValidationError";
    this.issue = issue;
  }
}

type UnknownRecord = Record<string, unknown>;

const idPattern = /^match_[a-z0-9][a-z0-9_-]*$/;

export function isEvidenceRequirementMatchId(value: string): value is EvidenceRequirementMatchId {
  return idPattern.test(value);
}

export function parseEvidenceRequirementMatch(input: unknown): EvidenceRequirementMatch {
  const match = asRecord(input, "match");
  const id = matchId(match.id);
  const requirementId = requirementReference(match.requirementId);
  const explanation = text(match.explanation, "explanation");
  const outcome = text(match.outcome, "outcome") as EvidenceRequirementMatchOutcome;
  const evidenceIds = evidenceReferences(match.evidenceIds);

  switch (outcome) {
    case "supported":
    case "partially-supported":
      if (evidenceIds.length === 0) {
        invalid(`${outcome} matches must reference at least one evidence id`);
      }

      return {
        id,
        requirementId,
        explanation,
        outcome,
        evidenceIds: evidenceIds as [EvidenceId, ...EvidenceId[]],
      };
    case "unsupported":
      if (evidenceIds.length !== 0) {
        invalid("unsupported matches must not reference evidence ids");
      }

      return { id, requirementId, explanation, outcome, evidenceIds: [] };
    default:
      invalid(`outcome must be one of: ${evidenceRequirementMatchOutcomes.join(", ")}`);
  }
}

function asRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${field} must be an object`);
  }

  return value as UnknownRecord;
}

function matchId(value: unknown): EvidenceRequirementMatchId {
  const id = text(value, "id");
  if (!isEvidenceRequirementMatchId(id)) {
    invalid("id must use the match_<lowercase-identifier> format");
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

  const ids = value.map((item, index) => evidenceReference(item, index));
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
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
  throw new EvidenceRequirementMatchValidationError(issue);
}
