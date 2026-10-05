import { CandidateEvidenceCollection } from "./candidate-evidence-collection.ts";
import { EvidenceRequirementMatchCollection } from "./evidence-requirement-match-collection.ts";
import { JobRequirementCollection } from "./job-requirement-collection.ts";
import { type JobRequirement } from "./job-requirement.ts";
import {
  createSupportedClaimCollection,
  type SupportedClaimCollection,
} from "./supported-claim-collection.ts";

export type DeriveSupportedClaimsInput = {
  evidence: CandidateEvidenceCollection;
  requirements: JobRequirementCollection;
  matches: EvidenceRequirementMatchCollection;
};

/**
 * Derives only the factual claims justified by current deterministic support
 * rules. Match order is retained; unsupported and partial outcomes are skipped.
 */
export function deriveSupportedClaims(
  input: DeriveSupportedClaimsInput,
): SupportedClaimCollection {
  const claims = input.matches.all().flatMap((match) => {
    if (match.outcome !== "supported") {
      return [];
    }

    const requirement = input.requirements.getById(match.requirementId);
    if (requirement === undefined) {
      return [];
    }

    const text = claimText(requirement);
    if (text === undefined) {
      return [];
    }

    return [{
      id: `claim_${requirement.id.slice("requirement_".length)}`,
      text,
      requirementId: match.requirementId,
      evidenceIds: match.evidenceIds,
    }];
  });

  return createSupportedClaimCollection({
    evidence: input.evidence,
    requirements: input.requirements,
    claims,
  });
}

function claimText(requirement: JobRequirement): string | undefined {
  switch (requirement.type) {
    case "skill":
    case "certification":
      return requirement.name;
    default:
      return undefined;
  }
}
