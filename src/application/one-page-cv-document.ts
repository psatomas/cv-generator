import { type CandidateProfile } from "../domain/candidate-profile.ts";
import {
  type OnePageCvDocument,
  type OnePageCvHeader,
  type OnePageCvSection,
  type OnePageCvSectionKind,
} from "../domain/one-page-cv-document.ts";
import { type CvComposition } from "./cv-composition.ts";

export type AssembleOnePageCvDocumentInput = {
  readonly profile: CandidateProfile;
  readonly composition: CvComposition;
};

const sectionDefinitions: readonly { kind: OnePageCvSectionKind; title: string }[] = [
  { kind: "skills", title: "Skills" },
  { kind: "statements", title: "Relevant Experience" },
  { kind: "certifications", title: "Certifications" },
];

/**
 * Maps already-canonical profile and composition values to a render-facing
 * document without revisiting evidence, matching, or grounding identifiers.
 */
export function assembleOnePageCvDocument(
  input: AssembleOnePageCvDocumentInput,
): OnePageCvDocument {
  const groupedEntries: Record<OnePageCvSectionKind, string[]> = {
    skills: [],
    statements: [],
    certifications: [],
  };
  for (const entry of input.composition.entries) {
    groupedEntries[sectionKind(entry.kind)].push(entry.text);
  }

  const sections: OnePageCvSection[] = sectionDefinitions.flatMap(({ kind, title }) => {
    const entries = groupedEntries[kind];
    return entries.length === 0
      ? []
      : [Object.freeze({ kind, title, entries: Object.freeze(entries) })];
  });

  return Object.freeze({
    header: header(input.profile),
    summary: input.composition.summary?.text ?? null,
    sections: Object.freeze(sections),
  });
}

function sectionKind(kind: "skill" | "certification" | "statement"): OnePageCvSectionKind {
  switch (kind) {
    case "skill":
      return "skills";
    case "certification":
      return "certifications";
    case "statement":
      return "statements";
  }
}

function header(profile: CandidateProfile): OnePageCvHeader {
  const optionalFields = [
    "professionalTitle",
    "location",
    "email",
    "phone",
    "githubUrl",
    "linkedinUrl",
    "websiteUrl",
  ] as const;
  const value: { fullName: string; [key: string]: string } = { fullName: profile.fullName };
  for (const field of optionalFields) {
    const item = profile[field];
    if (item !== undefined) {
      value[field] = item;
    }
  }

  return Object.freeze(value) as OnePageCvHeader;
}
