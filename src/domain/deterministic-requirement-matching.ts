import { CandidateEvidenceCollection } from "./candidate-evidence-collection.ts";
import { type CandidateEvidence } from "./candidate-evidence.ts";
import {
  createEvidenceRequirementMatchCollection,
  type EvidenceRequirementMatchCollection,
} from "./evidence-requirement-match-collection.ts";
import { JobRequirementCollection } from "./job-requirement-collection.ts";
import { type JobRequirement, type JobRequirementId } from "./job-requirement.ts";

type DeterministicRequirementMatchingInput = {
  evidence: CandidateEvidenceCollection;
  requirements: JobRequirementCollection;
};

/**
 * Evaluates only exact structured name equality for skill and certification
 * requirements. This baseline intentionally produces supported or unsupported
 * outcomes only; no current rule establishes a meaningful partial outcome.
 */
export function matchEvidenceToRequirements(
  input: DeterministicRequirementMatchingInput,
): EvidenceRequirementMatchCollection {
  const matches = input.requirements.all().map((requirement) =>
    matchRequirement(requirement, input.evidence),
  );

  return createEvidenceRequirementMatchCollection({
    evidence: input.evidence,
    requirements: input.requirements,
    matches,
  });
}

function matchRequirement(
  requirement: JobRequirement,
  evidence: CandidateEvidenceCollection,
): unknown {
  switch (requirement.type) {
    case "skill":
      return exactNameMatch({
        requirementId: requirement.id,
        requirementName: requirement.name,
        evidence: evidence.getByType("skill"),
        evidenceName: (item) => item.name,
        evidenceKind: "skill",
      });
    case "certification":
      return exactNameMatch({
        requirementId: requirement.id,
        requirementName: requirement.name,
        evidence: evidence.getByType("certification"),
        evidenceName: (item) => item.name,
        evidenceKind: "certification",
      });
    default:
      return {
        id: matchIdFor(requirement.id),
        requirementId: requirement.id,
        outcome: "unsupported",
        evidenceIds: [],
        explanation: `The deterministic matcher cannot establish support for ${requirement.type} requirements from available structured evidence.`,
      };
  }
}

function exactNameMatch<T extends CandidateEvidence>(input: {
  requirementId: JobRequirementId;
  requirementName: string;
  evidence: readonly T[];
  evidenceName: (item: T) => string;
  evidenceKind: "skill" | "certification";
}): unknown {
  const normalizedRequirementName = normalize(input.requirementName);
  const evidenceIds = input.evidence
    .filter((item) => normalize(input.evidenceName(item)) === normalizedRequirementName)
    .map((item) => item.id);

  if (evidenceIds.length > 0) {
    return {
      id: matchIdFor(input.requirementId),
      requirementId: input.requirementId,
      outcome: "supported",
      evidenceIds,
      explanation: `${capitalize(input.evidenceKind)} evidence exactly matches required ${input.evidenceKind} "${input.requirementName}".`,
    };
  }

  return {
    id: matchIdFor(input.requirementId),
    requirementId: input.requirementId,
    outcome: "unsupported",
    evidenceIds: [],
    explanation: `No ${input.evidenceKind} evidence exactly matches required ${input.evidenceKind} "${input.requirementName}".`,
  };
}

function matchIdFor(requirementId: JobRequirementId): `match_${string}` {
  return `match_${requirementId}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function capitalize(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
