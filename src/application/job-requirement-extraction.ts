import {
  JobRequirementValidationError,
  jobRequirementTypes,
  parseJobRequirement,
  type JobRequirement,
  type JobRequirementId,
  type JobRequirementType,
} from "../domain/job-requirement.ts";
import {
  createJobRequirementCollection,
  type JobRequirementCollection,
} from "../domain/job-requirement-collection.ts";

/** The raw source text supplied to a provider-neutral extractor. */
export type JobDescription = {
  readonly text: string;
};

/**
 * Provider adapters return untrusted data. The application boundary assigns
 * canonical identifiers and validates it before it can enter the domain.
 */
export interface JobRequirementExtractor {
  extract(jobDescription: JobDescription): Promise<unknown>;
}

export type ExtractJobRequirementsInput = {
  readonly jobDescription: JobDescription;
  readonly extractor: JobRequirementExtractor;
};

export type JobRequirementExtractionResult = {
  readonly source: JobDescription;
  readonly requirements: JobRequirementCollection;
};

export class InvalidJobDescriptionError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid job description: ${issue}`);
    this.name = "InvalidJobDescriptionError";
    this.issue = issue;
  }
}

export class JobRequirementExtractorInvocationError extends Error {
  public readonly cause: unknown;

  constructor(cause: unknown) {
    super("Job requirement extractor invocation failed");
    this.name = "JobRequirementExtractorInvocationError";
    this.cause = cause;
  }
}

export class InvalidExtractedJobRequirementsError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid extracted job requirements: ${issue}`);
    this.name = "InvalidExtractedJobRequirementsError";
    this.issue = issue;
  }
}

export class InvalidExtractedJobRequirementError extends Error {
  public readonly index: number;
  public readonly issue: string;

  constructor(index: number, issue: string) {
    super(`Invalid extracted job requirement at index ${index}: ${issue}`);
    this.name = "InvalidExtractedJobRequirementError";
    this.index = index;
    this.issue = issue;
  }
}

/**
 * Canonicalizes one ordered extractor response. IDs are local to this result:
 * requirement_<type>_<three-digit extraction ordinal>.
 */
export async function extractJobRequirements(
  input: ExtractJobRequirementsInput,
): Promise<JobRequirementExtractionResult> {
  const source = validateJobDescription(input.jobDescription);
  const extracted = await invokeExtractor(input.extractor, source);

  if (!Array.isArray(extracted)) {
    throw new InvalidExtractedJobRequirementsError("extractor result must be an array");
  }

  const requirements = extracted.map((candidate, index) =>
    parseExtractedRequirement(candidate, index),
  );

  return {
    source,
    requirements: createJobRequirementCollection(requirements),
  };
}

function validateJobDescription(input: JobDescription): JobDescription {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvalidJobDescriptionError("job description must be an object");
  }

  if (typeof input.text !== "string" || input.text.trim().length === 0) {
    throw new InvalidJobDescriptionError("text must be a non-empty string");
  }

  return Object.freeze({ text: input.text });
}

async function invokeExtractor(
  extractor: JobRequirementExtractor,
  source: JobDescription,
): Promise<unknown> {
  try {
    return await extractor.extract(source);
  } catch (error) {
    throw new JobRequirementExtractorInvocationError(error);
  }
}

function parseExtractedRequirement(input: unknown, index: number): JobRequirement {
  const candidate = asRecord(input);
  const id = createRequirementId(candidate.type, index);

  try {
    return parseJobRequirement({ ...candidate, id });
  } catch (error) {
    if (error instanceof JobRequirementValidationError) {
      throw new InvalidExtractedJobRequirementError(index, error.issue);
    }

    throw error;
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}

function createRequirementId(type: unknown, index: number): JobRequirementId {
  const typeSegment = isJobRequirementType(type) ? type : "unknown";
  const ordinal = String(index + 1).padStart(3, "0");
  return `requirement_${typeSegment}_${ordinal}`;
}

function isJobRequirementType(value: unknown): value is JobRequirementType {
  return typeof value === "string" && jobRequirementTypes.includes(value as JobRequirementType);
}
