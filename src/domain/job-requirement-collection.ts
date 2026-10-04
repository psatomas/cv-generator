import {
  JobRequirementValidationError,
  parseJobRequirement,
  type JobRequirement,
  type JobRequirementId,
  type JobRequirementPreference,
  type JobRequirementType,
} from "./job-requirement.ts";

export class JobRequirementCollectionValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid job requirement collection: ${issue}`);
    this.name = "JobRequirementCollectionValidationError";
    this.issue = issue;
  }
}

/**
 * The collection preserves parsed input order exactly. Type and preference
 * filtering preserve the relative order of matching requirements.
 */
export class JobRequirementCollection {
  private readonly items: readonly JobRequirement[];

  private constructor(items: readonly JobRequirement[]) {
    this.items = items;
  }

  public static create(input: unknown): JobRequirementCollection {
    if (!Array.isArray(input)) {
      invalid("items must be an array of job requirements");
    }

    if (input.length === 0) {
      invalid("items must contain at least one job requirement");
    }

    const requirements = input.map((item, index) => parseRequirementItem(item, index));
    const ids = new Set<JobRequirementId>();

    for (const requirement of requirements) {
      if (ids.has(requirement.id)) {
        invalid(`duplicate requirement id: ${requirement.id}`);
      }

      ids.add(requirement.id);
    }

    return new JobRequirementCollection(
      Object.freeze(requirements.map((requirement) => freezeRecursively(requirement))),
    );
  }

  public all(): readonly JobRequirement[] {
    return Object.freeze([...this.items]);
  }

  public getById(id: JobRequirementId): JobRequirement | undefined {
    return this.items.find((requirement) => requirement.id === id);
  }

  public getByType<T extends JobRequirementType>(
    type: T,
  ): readonly Extract<JobRequirement, { type: T }>[] {
    return Object.freeze(
      this.items.filter((requirement) => requirement.type === type),
    ) as readonly Extract<JobRequirement, { type: T }>[];
  }

  public getByPreference(preference: JobRequirementPreference): readonly JobRequirement[] {
    return Object.freeze(this.items.filter((requirement) => requirement.preference === preference));
  }
}

export function createJobRequirementCollection(input: unknown): JobRequirementCollection {
  return JobRequirementCollection.create(input);
}

function parseRequirementItem(input: unknown, index: number): JobRequirement {
  try {
    return parseJobRequirement(input);
  } catch (error) {
    if (error instanceof JobRequirementValidationError) {
      invalid(`item at index ${index} is invalid: ${error.issue}`);
    }

    throw error;
  }
}

function freezeRecursively<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      freezeRecursively(child);
    }

    Object.freeze(value);
  }

  return value;
}

function invalid(issue: string): never {
  throw new JobRequirementCollectionValidationError(issue);
}
