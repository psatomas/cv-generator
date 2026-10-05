import {
  analyzeJob,
  type JobAnalysisResult,
} from "./job-analysis.ts";
import {
  composeCv,
  type CvComposer,
  type CvComposition,
} from "./cv-composition.ts";
import { type CandidateEvidenceRepository } from "./candidate-evidence-repository.ts";
import {
  type JobDescription,
  type JobRequirementExtractor,
} from "./job-requirement-extraction.ts";
import {
  deriveSupportedClaims,
} from "../domain/derive-supported-claims.ts";
import { type SupportedClaimCollection } from "../domain/supported-claim-collection.ts";

export type GenerateCvForJobInput = {
  readonly jobDescription: JobDescription;
  readonly evidenceRepository: CandidateEvidenceRepository;
  readonly extractor: JobRequirementExtractor;
  readonly composer: CvComposer;
};

export type CvGenerationResult = JobAnalysisResult & {
  readonly claims: SupportedClaimCollection;
  readonly composition: CvComposition;
};

/**
 * Orchestrates established canonical boundaries without adding provider,
 * persistence, matching, claim, or composition behavior of its own.
 */
export async function generateCvForJob(
  input: GenerateCvForJobInput,
): Promise<CvGenerationResult> {
  const analysis = await analyzeJob({
    jobDescription: input.jobDescription,
    evidenceRepository: input.evidenceRepository,
    extractor: input.extractor,
  });
  const claims = deriveSupportedClaims({
    evidence: analysis.evidence,
    requirements: analysis.requirements,
    matches: analysis.matches,
  });
  const composition = await composeCv({
    claims,
    evidence: analysis.evidence,
    requirements: analysis.requirements,
    composer: input.composer,
  });

  return {
    ...analysis,
    claims,
    composition,
  };
}
