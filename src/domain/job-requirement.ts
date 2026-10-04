export const jobRequirementTypes = [
  "skill",
  "experience",
  "education",
  "certification",
  "responsibility",
  "domain-knowledge",
  "language",
  "location-work-arrangement",
] as const;

export const jobRequirementPreferences = ["required", "preferred"] as const;
export const jobRequirementPriorities = ["low", "medium", "high", "critical"] as const;
export const languageProficiencies = ["basic", "professional", "fluent", "native"] as const;
export const workArrangements = ["remote", "hybrid", "onsite"] as const;

export type JobRequirementType = (typeof jobRequirementTypes)[number];
export type JobRequirementId = `requirement_${string}`;
export type JobRequirementPreference = (typeof jobRequirementPreferences)[number];
export type JobRequirementPriority = (typeof jobRequirementPriorities)[number];
export type LanguageProficiency = (typeof languageProficiencies)[number];
export type WorkArrangement = (typeof workArrangements)[number];

type JobRequirementBase = {
  id: JobRequirementId;
  text: string;
  preference: JobRequirementPreference;
  priority: JobRequirementPriority;
};

export type SkillJobRequirement = JobRequirementBase & {
  type: "skill";
  name: string;
};

export type ExperienceJobRequirement = JobRequirementBase & {
  type: "experience";
  area: string;
  minimumYears?: number;
};

export type EducationJobRequirement = JobRequirementBase & {
  type: "education";
  qualification: string;
};

export type CertificationJobRequirement = JobRequirementBase & {
  type: "certification";
  name: string;
};

export type ResponsibilityJobRequirement = JobRequirementBase & {
  type: "responsibility";
};

export type DomainKnowledgeJobRequirement = JobRequirementBase & {
  type: "domain-knowledge";
  topic: string;
};

export type LanguageJobRequirement = JobRequirementBase & {
  type: "language";
  language: string;
  proficiency?: LanguageProficiency;
};

export type LocationWorkArrangementJobRequirement = JobRequirementBase & {
  type: "location-work-arrangement";
  location?: string;
  arrangement?: WorkArrangement;
};

export type JobRequirement =
  | SkillJobRequirement
  | ExperienceJobRequirement
  | EducationJobRequirement
  | CertificationJobRequirement
  | ResponsibilityJobRequirement
  | DomainKnowledgeJobRequirement
  | LanguageJobRequirement
  | LocationWorkArrangementJobRequirement;

export class JobRequirementValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid job requirement: ${issue}`);
    this.name = "JobRequirementValidationError";
    this.issue = issue;
  }
}

type UnknownRecord = Record<string, unknown>;

const idPattern = /^requirement_[a-z0-9][a-z0-9_-]*$/;

export function isJobRequirementId(value: string): value is JobRequirementId {
  return idPattern.test(value);
}

export function parseJobRequirement(input: unknown): JobRequirement {
  const requirement = asRecord(input, "requirement");
  const base = parseBase(requirement);
  const type = text(requirement.type, "type") as JobRequirementType;

  switch (type) {
    case "skill":
      return { ...base, type, name: text(requirement.name, "name") };
    case "experience":
      return {
        ...base,
        type,
        area: text(requirement.area, "area"),
        minimumYears: optionalMinimumYears(requirement.minimumYears),
      };
    case "education":
      return { ...base, type, qualification: text(requirement.qualification, "qualification") };
    case "certification":
      return { ...base, type, name: text(requirement.name, "name") };
    case "responsibility":
      return { ...base, type };
    case "domain-knowledge":
      return { ...base, type, topic: text(requirement.topic, "topic") };
    case "language":
      return {
        ...base,
        type,
        language: text(requirement.language, "language"),
        proficiency: optionalEnum(
          requirement.proficiency,
          "proficiency",
          languageProficiencies,
        ) as LanguageProficiency | undefined,
      };
    case "location-work-arrangement": {
      const location = optionalText(requirement.location, "location");
      const arrangement = optionalEnum(
        requirement.arrangement,
        "arrangement",
        workArrangements,
      ) as WorkArrangement | undefined;
      if (location === undefined && arrangement === undefined) {
        invalid("location or arrangement must be provided");
      }

      return { ...base, type, location, arrangement };
    }
    default:
      invalid(`type must be one of: ${jobRequirementTypes.join(", ")}`);
  }
}

function parseBase(requirement: UnknownRecord): JobRequirementBase {
  return {
    id: requirementId(requirement.id),
    text: text(requirement.text, "text"),
    preference: requiredEnum(
      requirement.preference,
      "preference",
      jobRequirementPreferences,
    ) as JobRequirementPreference,
    priority: requiredEnum(
      requirement.priority,
      "priority",
      jobRequirementPriorities,
    ) as JobRequirementPriority,
  };
}

function asRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${field} must be an object`);
  }

  return value as UnknownRecord;
}

function requirementId(value: unknown): JobRequirementId {
  const id = text(value, "id");
  if (!isJobRequirementId(id)) {
    invalid("id must use the requirement_<lowercase-identifier> format");
  }

  return id;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function optionalText(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : text(value, field);
}

function requiredEnum(value: unknown, field: string, options: readonly string[]): string {
  return enumValue(text(value, field), field, options);
}

function optionalEnum(
  value: unknown,
  field: string,
  options: readonly string[],
): string | undefined {
  return value === undefined ? undefined : enumValue(text(value, field), field, options);
}

function enumValue(value: string, field: string, options: readonly string[]): string {
  if (!options.includes(value)) {
    invalid(`${field} must be one of: ${options.join(", ")}`);
  }

  return value;
}

function optionalMinimumYears(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    invalid("minimumYears must be a positive integer");
  }

  return value;
}

function invalid(issue: string): never {
  throw new JobRequirementValidationError(issue);
}
