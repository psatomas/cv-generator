import { type CandidateEvidenceCollection } from "../domain/candidate-evidence-collection.ts";
import { type CandidateEvidence } from "../domain/candidate-evidence.ts";
import { type JobRequirementCollection } from "../domain/job-requirement-collection.ts";
import { type JobRequirement } from "../domain/job-requirement.ts";
import {
  isSupportedClaimId,
  type SupportedClaim,
  type SupportedClaimId,
} from "../domain/supported-claim.ts";
import { type SupportedClaimCollection } from "../domain/supported-claim-collection.ts";

export const cvCompositionEntryKinds = ["skill", "certification", "statement"] as const;

export type CvCompositionEntryKind = (typeof cvCompositionEntryKinds)[number];

export type CvCompositionClaimContext = Readonly<{
  claim: SupportedClaim;
  requirement: JobRequirement;
  evidence: readonly CandidateEvidence[];
}>;

export type CvCompositionContext = Readonly<{
  claims: readonly CvCompositionClaimContext[];
}>;

export interface CvComposer {
  compose(context: CvCompositionContext): Promise<unknown>;
}

export type CvCompositionSummary = Readonly<{
  text: string;
  claimIds: readonly [SupportedClaimId, ...SupportedClaimId[]];
}>;

export type CvCompositionEntry = Readonly<{
  kind: CvCompositionEntryKind;
  text: string;
  claimIds: readonly [SupportedClaimId, ...SupportedClaimId[]];
}>;

export type CvComposition = Readonly<{
  summary: CvCompositionSummary | null;
  entries: readonly CvCompositionEntry[];
}>;

export type ComposeCvInput = {
  readonly claims: SupportedClaimCollection;
  readonly evidence: CandidateEvidenceCollection;
  readonly requirements: JobRequirementCollection;
  readonly composer: CvComposer;
};

export class CvComposerInvocationError extends Error {
  public readonly cause: unknown;

  constructor(cause: unknown) {
    super("CV composer invocation failed");
    this.name = "CvComposerInvocationError";
    this.cause = cause;
  }
}

export class CvCompositionValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid CV composition: ${issue}`);
    this.name = "CvCompositionValidationError";
    this.issue = issue;
  }
}

/**
 * Gives a provider only facts authorized by supported claims, then validates
 * its untrusted structured output against the same claim collection.
 */
export async function composeCv(input: ComposeCvInput): Promise<CvComposition> {
  if (input.claims.all().length === 0) {
    return emptyComposition();
  }

  const context = createCompositionContext(input);
  let output: unknown;
  try {
    output = await input.composer.compose(context);
  } catch (error) {
    throw new CvComposerInvocationError(error);
  }

  return parseCvComposition(output, input.claims);
}

export function parseCvComposition(
  input: unknown,
  claims: SupportedClaimCollection,
): CvComposition {
  const composition = asRecord(input, "composition");
  const summary = parseSummary(composition.summary, claims);
  const entries = parseEntries(composition.entries, claims);

  return Object.freeze({ summary, entries: Object.freeze(entries) });
}

function createCompositionContext(input: ComposeCvInput): CvCompositionContext {
  const claims = input.claims.all().map((claim) => {
    const requirement = input.requirements.getById(claim.requirementId);
    if (requirement === undefined) {
      invalid(`claim ${claim.id} references an unknown requirement id: ${claim.requirementId}`);
    }

    const evidence = claim.evidenceIds.map((id) => {
      const item = input.evidence.getById(id);
      if (item === undefined) {
        invalid(`claim ${claim.id} references an unknown evidence id: ${id}`);
      }

      return item;
    });

    return Object.freeze({ claim, requirement, evidence: Object.freeze(evidence) });
  });

  return Object.freeze({ claims: Object.freeze(claims) });
}

function parseSummary(value: unknown, claims: SupportedClaimCollection): CvCompositionSummary | null {
  if (value === null) {
    return null;
  }

  const summary = asRecord(value, "summary");
  return Object.freeze({
    text: text(summary.text, "summary.text"),
    claimIds: claimReferences(summary.claimIds, "summary.claimIds", claims),
  });
}

function parseEntries(value: unknown, claims: SupportedClaimCollection): CvCompositionEntry[] {
  if (!Array.isArray(value)) {
    invalid("entries must be an array");
  }

  return value.map((item, index) => {
    const entry = asRecord(item, `entries[${index}]`);
    const kind = text(entry.kind, `entries[${index}].kind`) as CvCompositionEntryKind;
    if (!cvCompositionEntryKinds.includes(kind)) {
      invalid(`entries[${index}].kind must be one of: ${cvCompositionEntryKinds.join(", ")}`);
    }

    return Object.freeze({
      kind,
      text: text(entry.text, `entries[${index}].text`),
      claimIds: claimReferences(entry.claimIds, `entries[${index}].claimIds`, claims),
    });
  });
}

function claimReferences(
  value: unknown,
  field: string,
  claims: SupportedClaimCollection,
): readonly [SupportedClaimId, ...SupportedClaimId[]] {
  if (!Array.isArray(value)) {
    invalid(`${field} must be an array of supported claim identifiers`);
  }
  if (value.length === 0) {
    invalid(`${field} must contain at least one supported claim identifier`);
  }

  const ids = value.map((item, index) => claimReference(item, `${field}[${index}]`, claims));
  if (new Set(ids).size !== ids.length) {
    invalid(`${field} must not contain duplicates`);
  }

  return Object.freeze(ids) as readonly [SupportedClaimId, ...SupportedClaimId[]];
}

function claimReference(
  value: unknown,
  field: string,
  claims: SupportedClaimCollection,
): SupportedClaimId {
  const id = text(value, field);
  if (!isSupportedClaimId(id)) {
    invalid(`${field} must use the claim_<lowercase-identifier> format`);
  }
  if (claims.getById(id) === undefined) {
    invalid(`${field} references an unknown supported claim id: ${id}`);
  }

  return id;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${field} must be an object`);
  }

  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function emptyComposition(): CvComposition {
  return Object.freeze({ summary: null, entries: Object.freeze([]) });
}

function invalid(issue: string): never {
  throw new CvCompositionValidationError(issue);
}
