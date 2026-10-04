export const evidenceTypes = [
  "professional-experience",
  "project",
  "education",
  "certification",
  "skill",
  "achievement",
] as const;

export type EvidenceType = (typeof evidenceTypes)[number];
export type EvidenceId = `evidence_${string}`;

export type CandidateStatementProvenance = {
  kind: "candidate-statement";
  statement: string;
  recordedOn: string;
};

export type DocumentProvenance = {
  kind: "document";
  documentName: string;
  recordedOn: string;
  documentLocator?: string;
};

export type EvidenceProvenance =
  | CandidateStatementProvenance
  | DocumentProvenance;

type EvidenceBase = {
  id: EvidenceId;
  provenance: EvidenceProvenance;
};

export type ProfessionalExperienceEvidence = EvidenceBase & {
  type: "professional-experience";
  employer: string;
  role: string;
  startDate: string;
  endDate?: string;
  highlights: readonly string[];
};

export type ProjectEvidence = EvidenceBase & {
  type: "project";
  name: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  technologies: readonly string[];
  highlights: readonly string[];
};

export type EducationEvidence = EvidenceBase & {
  type: "education";
  institution: string;
  qualification: string;
  fieldOfStudy?: string;
  completedOn?: string;
};

export type CertificationEvidence = EvidenceBase & {
  type: "certification";
  name: string;
  issuer: string;
  awardedOn: string;
  credentialId?: string;
  credentialUrl?: string;
};

export type SkillEvidence = EvidenceBase & {
  type: "skill";
  name: string;
  level: "foundational" | "working" | "advanced" | "expert";
};

export type AchievementEvidence = EvidenceBase & {
  type: "achievement";
  title: string;
  description: string;
  achievedOn?: string;
};

export type CandidateEvidence =
  | ProfessionalExperienceEvidence
  | ProjectEvidence
  | EducationEvidence
  | CertificationEvidence
  | SkillEvidence
  | AchievementEvidence;

export class CandidateEvidenceValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid candidate evidence: ${issue}`);
    this.name = "CandidateEvidenceValidationError";
    this.issue = issue;
  }
}

type UnknownRecord = Record<string, unknown>;

const idPattern = /^evidence_[a-z0-9][a-z0-9_-]*$/;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const skillLevels = new Set(["foundational", "working", "advanced", "expert"]);

export function isEvidenceId(value: string): value is EvidenceId {
  return idPattern.test(value);
}

export function parseCandidateEvidence(input: unknown): CandidateEvidence {
  const evidence = asRecord(input, "evidence");
  const id = evidenceId(evidence.id);
  const provenance = parseProvenance(evidence.provenance);
  const type = text(evidence.type, "type") as EvidenceType;

  switch (type) {
    case "professional-experience": {
      const startDate = month(evidence.startDate, "startDate");
      const endDate = optionalMonth(evidence.endDate, "endDate");
      ensureEndDateIsNotEarlier(startDate, endDate);

      return {
        id,
        type,
        provenance,
        employer: text(evidence.employer, "employer"),
        role: text(evidence.role, "role"),
        startDate,
        endDate,
        highlights: textList(evidence.highlights, "highlights", true),
      };
    }
    case "project": {
      const startDate = optionalMonth(evidence.startDate, "startDate");
      const endDate = optionalMonth(evidence.endDate, "endDate");
      if (startDate !== undefined) {
        ensureEndDateIsNotEarlier(startDate, endDate);
      }

      return {
        id,
        type,
        provenance,
        name: text(evidence.name, "name"),
        role: optionalText(evidence.role, "role"),
        startDate,
        endDate,
        technologies: textList(evidence.technologies, "technologies"),
        highlights: textList(evidence.highlights, "highlights", true),
      };
    }
    case "education":
      return {
        id,
        type,
        provenance,
        institution: text(evidence.institution, "institution"),
        qualification: text(evidence.qualification, "qualification"),
        fieldOfStudy: optionalText(evidence.fieldOfStudy, "fieldOfStudy"),
        completedOn: optionalDate(evidence.completedOn, "completedOn"),
      };
    case "certification":
      return {
        id,
        type,
        provenance,
        name: text(evidence.name, "name"),
        issuer: text(evidence.issuer, "issuer"),
        awardedOn: date(evidence.awardedOn, "awardedOn"),
        credentialId: optionalText(evidence.credentialId, "credentialId"),
        credentialUrl: optionalUrl(evidence.credentialUrl, "credentialUrl"),
      };
    case "skill": {
      const level = text(evidence.level, "level");
      if (!skillLevels.has(level)) {
        invalid("level must be foundational, working, advanced, or expert");
      }

      return { id, type, provenance, name: text(evidence.name, "name"), level: level as SkillEvidence["level"] };
    }
    case "achievement":
      return {
        id,
        type,
        provenance,
        title: text(evidence.title, "title"),
        description: text(evidence.description, "description"),
        achievedOn: optionalDate(evidence.achievedOn, "achievedOn"),
      };
    default:
      invalid(`type must be one of: ${evidenceTypes.join(", ")}`);
  }
}

function parseProvenance(input: unknown): EvidenceProvenance {
  const provenance = asRecord(input, "provenance");
  const kind = text(provenance.kind, "provenance.kind");
  const recordedOn = date(provenance.recordedOn, "provenance.recordedOn");

  if (kind === "candidate-statement") {
    return {
      kind,
      statement: text(provenance.statement, "provenance.statement"),
      recordedOn,
    };
  }

  if (kind === "document") {
    return {
      kind,
      documentName: text(provenance.documentName, "provenance.documentName"),
      recordedOn,
      documentLocator: optionalUrl(provenance.documentLocator, "provenance.documentLocator"),
    };
  }

  invalid("provenance.kind must be candidate-statement or document");
}

function asRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${field} must be an object`);
  }

  return value as UnknownRecord;
}

function evidenceId(value: unknown): EvidenceId {
  const id = text(value, "id");
  if (!isEvidenceId(id)) {
    invalid("id must use the evidence_<lowercase-identifier> format");
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

function textList(value: unknown, field: string, required = false): readonly string[] {
  if (!Array.isArray(value)) {
    invalid(`${field} must be an array of non-empty strings`);
  }

  const values = value.map((item, index) => text(item, `${field}[${index}]`));
  if (required && values.length === 0) {
    invalid(`${field} must contain at least one item`);
  }

  return values;
}

function month(value: unknown, field: string): string {
  const result = text(value, field);
  if (!monthPattern.test(result)) {
    invalid(`${field} must use the YYYY-MM format`);
  }

  return result;
}

function optionalMonth(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : month(value, field);
}

function ensureEndDateIsNotEarlier(startDate: string, endDate: string | undefined): void {
  if (endDate !== undefined && endDate < startDate) {
    invalid("endDate must not be earlier than startDate");
  }
}

function date(value: unknown, field: string): string {
  const result = text(value, field);
  const match = datePattern.exec(result);
  if (match === null) {
    invalid(`${field} must use the YYYY-MM-DD format`);
  }

  const [year, monthValue, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, monthValue - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== monthValue - 1 ||
    parsed.getUTCDate() !== day
  ) {
    invalid(`${field} must be a valid calendar date`);
  }

  return result;
}

function optionalDate(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : date(value, field);
}

function optionalUrl(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const url = text(value, field);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      invalid(`${field} must use the http or https protocol`);
    }
  } catch {
    invalid(`${field} must be a valid URL`);
  }

  return url;
}

function invalid(issue: string): never {
  throw new CandidateEvidenceValidationError(issue);
}
