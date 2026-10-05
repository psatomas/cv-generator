import {
  getCandidateProfile,
  type CandidateProfileRepository,
} from "./candidate-profile-repository.ts";
import {
  generateCvForJob,
  type CvGenerationResult,
} from "./cv-generation.ts";
import { type CvComposer } from "./cv-composition.ts";
import { type CandidateEvidenceRepository } from "./candidate-evidence-repository.ts";
import {
  type JobDescription,
  type JobRequirementExtractor,
} from "./job-requirement-extraction.ts";
import { assembleOnePageCvDocument } from "./one-page-cv-document.ts";
import { type CandidateProfile } from "../domain/candidate-profile.ts";
import { type OnePageCvDocument } from "../domain/one-page-cv-document.ts";

export type GenerateOnePageCvForJobInput = {
  readonly jobDescription: JobDescription;
  readonly profileRepository: CandidateProfileRepository;
  readonly evidenceRepository: CandidateEvidenceRepository;
  readonly extractor: JobRequirementExtractor;
  readonly composer: CvComposer;
};

export type OnePageCvGenerationResult = CvGenerationResult & Readonly<{
  profile: CandidateProfile;
  document: OnePageCvDocument;
}>;

export class CandidateProfileRequiredError extends Error {
  constructor() {
    super("Candidate profile is required to generate a one-page CV");
    this.name = "CandidateProfileRequiredError";
  }
}

/**
 * Loads the canonical profile before reusing the established grounded CV
 * generation flow and mapping its composition to render-facing document data.
 */
export async function generateOnePageCvForJob(
  input: GenerateOnePageCvForJobInput,
): Promise<OnePageCvGenerationResult> {
  const profile = await getCandidateProfile(input.profileRepository);
  if (profile === undefined) {
    throw new CandidateProfileRequiredError();
  }

  const generation = await generateCvForJob({
    jobDescription: input.jobDescription,
    evidenceRepository: input.evidenceRepository,
    extractor: input.extractor,
    composer: input.composer,
  });
  const document = assembleOnePageCvDocument({
    profile,
    composition: generation.composition,
  });

  return Object.freeze({ ...generation, profile, document });
}
