import assert from "node:assert/strict";
import test from "node:test";

import { assembleOnePageCvDocument } from "./one-page-cv-document.ts";
import type { CvComposition } from "./cv-composition.ts";
import { parseCandidateProfile } from "../domain/candidate-profile.ts";
import type { SupportedClaimId } from "../domain/supported-claim.ts";

const claimIds = Object.freeze(["claim_skill_typescript"]) as readonly [SupportedClaimId];

function composition(
  summary: string | null,
  entries: readonly { kind: "skill" | "certification" | "statement"; text: string }[],
): CvComposition {
  return Object.freeze({
    summary: summary === null ? null : Object.freeze({ text: summary, claimIds }),
    entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry, claimIds }))),
  });
}

const completeProfile = parseCandidateProfile({
  fullName: "Alex Example",
  professionalTitle: "Protocol Engineer",
  location: "Recife, Brazil",
  email: "alex@example.com",
  phone: "+55 81 99999-9999",
  githubUrl: "https://github.com/example",
  linkedinUrl: "https://www.linkedin.com/in/example",
  websiteUrl: "https://example.dev",
});

test("copies a full profile and deterministically groups composition entries", () => {
  const document = assembleOnePageCvDocument({
    profile: completeProfile,
    composition: composition("Grounded summary", [
      { kind: "certification", text: "Cloud Practitioner" },
      { kind: "skill", text: "TypeScript" },
      { kind: "statement", text: "Built deterministic protocols." },
      { kind: "skill", text: "Solidity" },
      { kind: "certification", text: "Security Training" },
      { kind: "statement", text: "Implemented verification controls." },
    ]),
  });

  assert.deepEqual(document.header, {
    fullName: "Alex Example",
    professionalTitle: "Protocol Engineer",
    location: "Recife, Brazil",
    email: "alex@example.com",
    phone: "+55 81 99999-9999",
    githubUrl: "https://github.com/example",
    linkedinUrl: "https://www.linkedin.com/in/example",
    websiteUrl: "https://example.dev",
  });
  assert.equal(document.summary, "Grounded summary");
  assert.deepEqual(document.sections, [
    { kind: "skills", title: "Skills", entries: ["TypeScript", "Solidity"] },
    {
      kind: "statements",
      title: "Relevant Experience",
      entries: ["Built deterministic protocols.", "Implemented verification controls."],
    },
    { kind: "certifications", title: "Certifications", entries: ["Cloud Practitioner", "Security Training"] },
  ]);
});

test("preserves minimal headers and empty canonical compositions without empty sections", () => {
  const document = assembleOnePageCvDocument({
    profile: parseCandidateProfile({ fullName: "Alex Example" }),
    composition: composition(null, []),
  });

  assert.deepEqual(document, {
    header: { fullName: "Alex Example" },
    summary: null,
    sections: [],
  });
});

test("does not expose internal grounding identifiers in the presentation document", () => {
  const document = assembleOnePageCvDocument({
    profile: parseCandidateProfile({ fullName: "Alex Example" }),
    composition: composition("Summary", [{ kind: "skill", text: "TypeScript" }]),
  });
  const serialized = JSON.stringify(document);

  assert.equal(serialized.includes("claimIds"), false);
  assert.equal(serialized.includes("claim_skill_typescript"), false);
  assert.equal(serialized.includes("evidence_"), false);
  assert.equal(serialized.includes("requirement_"), false);
});

test("deep-freezes document and nested presentation structures", () => {
  const document = assembleOnePageCvDocument({
    profile: parseCandidateProfile({ fullName: "Alex Example" }),
    composition: composition(null, [{ kind: "skill", text: "TypeScript" }]),
  });

  assert.equal(Object.isFrozen(document), true);
  assert.equal(Object.isFrozen(document.header), true);
  assert.equal(Object.isFrozen(document.sections), true);
  assert.equal(Object.isFrozen(document.sections[0]), true);
  assert.equal(Object.isFrozen(document.sections[0].entries), true);
  assert.throws(() => (document.sections[0].entries as unknown as string[]).pop(), TypeError);
});
