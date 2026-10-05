import {
  reconstructCandidateEvidenceCollection,
  type CandidateEvidenceRepository,
} from "./candidate-evidence-repository.ts";
import {
  extractJobRequirements,
  type JobDescription,
  type JobRequirementExtractor,
} from "./job-requirement-extraction.ts";
import { type CandidateEvidenceCollection } from "../domain/candidate-evidence-collection.ts";
import { matchEvidenceToRequirements } from "../domain/deterministic-requirement-matching.ts";
import { type EvidenceRequirementMatchCollection } from "../domain/evidence-requirement-match-collection.ts";
import { type JobRequirementCollection } from "../domain/job-requirement-collection.ts";

export type AnalyzeJobInput = {
  readonly jobDescription: JobDescription;
  readonly evidenceRepository: CandidateEvidenceRepository;
  readonly extractor: JobRequirementExtractor;
};

export type JobAnalysisResult = {
  readonly source: JobDescription;
  readonly evidence: CandidateEvidenceCollection;
  readonly requirements: JobRequirementCollection;
  readonly matches: EvidenceRequirementMatchCollection;
};

/**
 * Composes the established application and domain boundaries without adding
 * provider, persistence, or matching behavior of its own.
 */
export async function analyzeJob(input: AnalyzeJobInput): Promise<JobAnalysisResult> {
  const extraction = await extractJobRequirements({
    jobDescription: input.jobDescription,
    extractor: input.extractor,
  });
  const evidence = await reconstructCandidateEvidenceCollection(input.evidenceRepository);
  const matches = matchEvidenceToRequirements({
    evidence,
    requirements: extraction.requirements,
  });

  return {
    source: extraction.source,
    evidence,
    requirements: extraction.requirements,
    matches,
  };
}
