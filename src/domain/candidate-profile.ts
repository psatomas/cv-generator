export type CandidateProfile = Readonly<{
  fullName: string;
  professionalTitle?: string;
  location?: string;
  email?: string;
  phone?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
}>;

export class CandidateProfileValidationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`Invalid candidate profile: ${issue}`);
    this.name = "CandidateProfileValidationError";
    this.issue = issue;
  }
}

type UnknownRecord = Record<string, unknown>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCandidateProfile(input: unknown): CandidateProfile {
  const profile = asRecord(input, "profile");

  return Object.freeze({
    fullName: text(profile.fullName, "fullName"),
    professionalTitle: optionalText(profile.professionalTitle, "professionalTitle"),
    location: optionalText(profile.location, "location"),
    email: optionalEmail(profile.email),
    phone: optionalText(profile.phone, "phone"),
    githubUrl: optionalUrl(profile.githubUrl, "githubUrl", "github.com"),
    linkedinUrl: optionalUrl(profile.linkedinUrl, "linkedinUrl", "linkedin.com"),
    websiteUrl: optionalUrl(profile.websiteUrl, "websiteUrl"),
  });
}

function asRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${field} must be an object`);
  }

  return value as UnknownRecord;
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

function optionalEmail(value: unknown): string | undefined {
  const email = optionalText(value, "email");
  if (email !== undefined && !emailPattern.test(email)) {
    invalid("email must be a valid email address");
  }

  return email;
}

function optionalUrl(value: unknown, field: string, expectedDomain?: string): string | undefined {
  const url = optionalText(value, field);
  if (url === undefined) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    invalid(`${field} must be a valid HTTP(S) URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    invalid(`${field} must be a valid HTTP(S) URL`);
  }
  if (expectedDomain !== undefined && !matchesDomain(parsed.hostname, expectedDomain)) {
    invalid(`${field} must use the ${expectedDomain} domain`);
  }

  return url;
}

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname === `www.${domain}`;
}

function invalid(issue: string): never {
  throw new CandidateProfileValidationError(issue);
}
