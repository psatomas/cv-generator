import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateProfileRequiredError,
  generateOnePageCvForJob,
} from "./one-page-cv-generation.ts";
import {
  InvalidPersistedCandidateProfileError,
  type CandidateProfileRepository,
} from "./candidate-profile-repository.ts";
import { type CandidateEvidenceRepository } from "./candidate-evidence-repository.ts";
import {
  type CvComposer,
  type CvCompositionContext,
} from "./cv-composition.ts";
import {
  type JobRequirementExtractor,
} from "./job-requirement-extraction.ts";

class FakeProfileRepository implements CandidateProfileRepository {
  public reads = 0;
  private readonly record: unknown | undefined;

  constructor(record: unknown | undefined) {
    this.record = record;
  }

  public async get(): Promise<unknown | undefined> {
    this.reads += 1;
    return this.record;
  }

  public async save(): Promise<void> {
    throw new Error("not used by one-page CV generation");
  }

  public async replace(): Promise<void> {
    throw new Error("not used by one-page CV generation");
  }
}

class FakeEvidenceRepository implements CandidateEvidenceRepository {
  public reads = 0;
  private readonly records: readonly unknown[];

  constructor(records: readonly unknown[]) {
    this.records = records;
  }

  public async list(): Promise<readonly unknown[]> {
    this.reads += 1;
    return this.records;
  }

  public async getById(): Promise<unknown | undefined> {
    return undefined;
  }

  public async save(): Promise<void> {
    throw new Error("not used by one-page CV generation");
  }

  public async replace(): Promise<void> {
    throw new Error("not used by one-page CV generation");
  }

  public async delete(): Promise<void> {
    throw new Error("not used by one-page CV generation");
  }
}

class FakeExtractor implements JobRequirementExtractor {
  public calls = 0;
  private readonly result: unknown;

  constructor(result: unknown) {
    this.result = result;
  }

  public async extract(): Promise<unknown> {
    this.calls += 1;
    return this.result;
  }
}

class FakeComposer implements CvComposer {
  public calls = 0;
  public readonly contexts: CvCompositionContext[] = [];
  private readonly result: unknown;

  constructor(result: unknown) {
    this.result = result;
  }

  public async compose(context: CvCompositionContext): Promise<unknown> {
    this.calls += 1;
    this.contexts.push(context);
    return this.result;
  }
}

const profile = {
  fullName: "Alex Example",
  professionalTitle: "Protocol Engineer",
  location: "Recife, Brazil",
  githubUrl: "https://github.com/example",
};

const provenance = {
  kind: "candidate-statement",
  statement: "Candidate confirmed this information.",
  recordedOn: "2026-10-05",
} as const;

const supportingEvidence = [
  {
    id: "evidence_skill_typescript",
    type: "skill",
    provenance,
    name: "TypeScript",
    level: "advanced",
  },
  {
    id: "evidence_certification_cloud",
    type: "certification",
    provenance,
    name: "Cloud Practitioner",
    issuer: "Example Cloud",
    awardedOn: "2024-04-30",
  },
] as const;

const supportedRequirements = [
  { type: "skill", text: "TypeScript", preference: "required", priority: "high", name: "TypeScript" },
  {
    type: "certification",
    text: "Cloud Practitioner certification",
    preference: "preferred",
    priority: "medium",
    name: "Cloud Practitioner",
  },
] as const;

const composition = {
  summary: { text: "TypeScript and cloud certified.", claimIds: ["claim_skill_001"] },
  entries: [
    { kind: "skill", text: "TypeScript", claimIds: ["claim_skill_001"] },
    { kind: "certification", text: "Cloud Practitioner", claimIds: ["claim_certification_002"] },
  ],
};

test("orchestrates canonical profile, generation, and one-page document assembly", async () => {
  const profileRepository = new FakeProfileRepository(profile);
  const evidenceRepository = new FakeEvidenceRepository(supportingEvidence);
  const extractor = new FakeExtractor(supportedRequirements);
  const composer = new FakeComposer(composition);

  const result = await generateOnePageCvForJob({
    jobDescription: { text: "TypeScript role" },
    profileRepository,
    evidenceRepository,
    extractor,
    composer,
  });

  assert.equal(result.profile.fullName, "Alex Example");
  assert.equal(result.source.text, "TypeScript role");
  assert.equal(result.evidence.all()[0].id, "evidence_skill_typescript");
  assert.equal(result.requirements.all()[0].id, "requirement_skill_001");
  assert.equal(result.matches.all()[0].outcome, "supported");
  assert.equal(result.claims.all()[0].id, "claim_skill_001");
  assert.equal(result.composition.summary?.claimIds[0], "claim_skill_001");
  assert.deepEqual(result.document, {
    header: profile,
    summary: "TypeScript and cloud certified.",
    sections: [
      { kind: "skills", title: "Skills", entries: ["TypeScript"] },
      { kind: "certifications", title: "Certifications", entries: ["Cloud Practitioner"] },
    ],
  });
  assert.equal(JSON.stringify(result.document).includes("claimIds"), false);
  assert.equal(JSON.stringify(result.document).includes("evidence_"), false);
  assert.equal(JSON.stringify(result.document).includes("requirement_"), false);
  assert.equal(profileRepository.reads, 1);
  assert.equal(evidenceRepository.reads, 1);
  assert.equal(extractor.calls, 1);
  assert.equal(composer.calls, 1);
});

test("fails before downstream generation when the candidate profile is missing", async () => {
  const evidenceRepository = new FakeEvidenceRepository(supportingEvidence);
  const extractor = new FakeExtractor(supportedRequirements);
  const composer = new FakeComposer(composition);

  await assert.rejects(
    () => generateOnePageCvForJob({
      jobDescription: { text: "TypeScript role" },
      profileRepository: new FakeProfileRepository(undefined),
      evidenceRepository,
      extractor,
      composer,
    }),
    CandidateProfileRequiredError,
  );

  assert.equal(evidenceRepository.reads, 0);
  assert.equal(extractor.calls, 0);
  assert.equal(composer.calls, 0);
});

test("keeps the real profile while returning an empty document for unsupported claims", async () => {
  const composer = new FakeComposer(composition);
  const result = await generateOnePageCvForJob({
    jobDescription: { text: "Rust role" },
    profileRepository: new FakeProfileRepository(profile),
    evidenceRepository: new FakeEvidenceRepository([supportingEvidence[0]]),
    extractor: new FakeExtractor([
      { type: "skill", text: "Rust", preference: "required", priority: "high", name: "Rust" },
    ]),
    composer,
  });

  assert.equal(result.profile.fullName, "Alex Example");
  assert.deepEqual(result.claims.all(), []);
  assert.deepEqual(result.composition, { summary: null, entries: [] });
  assert.deepEqual(result.document, {
    header: profile,
    summary: null,
    sections: [],
  });
  assert.equal(composer.calls, 0);
});

test("propagates invalid persisted candidate profiles unchanged", async () => {
  await assert.rejects(
    () => generateOnePageCvForJob({
      jobDescription: { text: "TypeScript role" },
      profileRepository: new FakeProfileRepository({ fullName: "" }),
      evidenceRepository: new FakeEvidenceRepository(supportingEvidence),
      extractor: new FakeExtractor(supportedRequirements),
      composer: new FakeComposer(composition),
    }),
    InvalidPersistedCandidateProfileError,
  );
});
