export const onePageCvSectionKinds = ["skills", "certifications", "statements"] as const;

export type OnePageCvSectionKind = (typeof onePageCvSectionKinds)[number];

export type OnePageCvHeader = Readonly<{
  fullName: string;
  professionalTitle?: string;
  location?: string;
  email?: string;
  phone?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
}>;

export type OnePageCvSection = Readonly<{
  kind: OnePageCvSectionKind;
  title: string;
  entries: readonly string[];
}>;

/** Render-facing document structure with no grounding or source identifiers. */
export type OnePageCvDocument = Readonly<{
  header: OnePageCvHeader;
  summary: string | null;
  sections: readonly OnePageCvSection[];
}>;
