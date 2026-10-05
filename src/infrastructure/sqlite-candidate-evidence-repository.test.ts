import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  CandidateEvidenceAlreadyExistsError,
  CandidateEvidenceNotFoundError,
  InvalidPersistedCandidateEvidenceError,
  getCandidateEvidence,
  listCandidateEvidence,
} from "../application/candidate-evidence-repository.ts";
import { parseCandidateEvidence, type CandidateEvidence } from "../domain/candidate-evidence.ts";
import {
  SqliteCandidateEvidencePayloadError,
  SqliteCandidateEvidenceRepository,
  initializeCandidateEvidenceSqliteSchema,
} from "./sqlite-candidate-evidence-repository.ts";

function createRepository() {
  const database = new Database(":memory:");
  return { database, repository: new SqliteCandidateEvidenceRepository(database) };
}

const evidenceVariants: readonly CandidateEvidence[] = [
  parseCandidateEvidence({
    id: "evidence_experience_acme",
    type: "professional-experience",
    provenance: { kind: "candidate-statement", statement: "Confirmed.", recordedOn: "2026-10-04" },
    employer: "Acme",
    role: "Engineer",
    startDate: "2022-01",
    highlights: ["Built a platform."],
  }),
  parseCandidateEvidence({
    id: "evidence_project_protocol",
    type: "project",
    provenance: { kind: "candidate-statement", statement: "Confirmed.", recordedOn: "2026-10-04" },
    name: "Protocol Explorer",
    technologies: ["TypeScript"],
    highlights: ["Implemented monitoring."],
  }),
  parseCandidateEvidence({
    id: "evidence_education_degree",
    type: "education",
    provenance: { kind: "candidate-statement", statement: "Confirmed.", recordedOn: "2026-10-04" },
    institution: "Example University",
    qualification: "BSc Computer Science",
  }),
  parseCandidateEvidence({
    id: "evidence_certification_cloud",
    type: "certification",
    provenance: { kind: "document", documentName: "Certificate", recordedOn: "2026-10-04" },
    name: "Cloud Practitioner",
    issuer: "Example Cloud",
    awardedOn: "2024-04-30",
  }),
  parseCandidateEvidence({
    id: "evidence_skill_typescript",
    type: "skill",
    provenance: { kind: "candidate-statement", statement: "Confirmed.", recordedOn: "2026-10-04" },
    name: "TypeScript",
    level: "advanced",
  }),
  parseCandidateEvidence({
    id: "evidence_achievement_award",
    type: "achievement",
    provenance: { kind: "candidate-statement", statement: "Confirmed.", recordedOn: "2026-10-04" },
    title: "Engineering Award",
    description: "Recognized for delivery quality.",
  }),
];

test("initializes the SQLite schema idempotently", () => {
  const database = new Database(":memory:");

  initializeCandidateEvidenceSqliteSchema(database);
  initializeCandidateEvidenceSqliteSchema(database);
  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'candidate_evidence'")
    .get() as { name: string } | undefined;
  assert.equal(
    table?.name,
    "candidate_evidence",
  );
  database.close();
});

test("round-trips every candidate evidence variant in insertion order", async () => {
  const { database, repository } = createRepository();

  for (const evidence of evidenceVariants) {
    await repository.save(evidence);
  }

  assert.deepEqual(
    await listCandidateEvidence(repository),
    evidenceVariants,
  );
  database.close();
});

test("implements create, lookup, replace, and delete semantics", async () => {
  const { database, repository } = createRepository();
  const skill = evidenceVariants[4];
  const project = evidenceVariants[1];

  await repository.save(skill);
  assert.equal((await repository.getById(skill.id) as { id: string }).id, skill.id);
  assert.equal(await repository.getById("evidence_unknown"), undefined);
  await assert.rejects(() => repository.save(skill), CandidateEvidenceAlreadyExistsError);
  await assert.rejects(() => repository.replace(project), CandidateEvidenceNotFoundError);

  const replacement = parseCandidateEvidence({ ...skill, level: "expert" });
  await repository.replace(replacement);
  assert.equal((await getCandidateEvidence(repository, skill.id) as { level: string }).level, "expert");

  await repository.delete(skill.id);
  await assert.rejects(() => repository.delete(skill.id), CandidateEvidenceNotFoundError);
  database.close();
});

test("preserves positions when records are replaced or deleted", async () => {
  const { database, repository } = createRepository();
  const [experience, project, education, certification] = evidenceVariants;
  await repository.save(experience);
  await repository.save(project);
  await repository.save(education);
  await repository.delete(project.id);
  await repository.replace(parseCandidateEvidence({ ...experience, role: "Senior Engineer" }));
  await repository.save(certification);

  assert.deepEqual(
    (await repository.list() as { id: string }[]).map((evidence) => evidence.id),
    [experience.id, education.id, certification.id],
  );
  database.close();
});

test("exposes malformed JSON and domain-invalid persisted payloads", async () => {
  const { database, repository } = createRepository();
  database
    .prepare("INSERT INTO candidate_evidence (evidence_id, payload, position) VALUES (?, ?, ?)")
    .run("evidence_invalid_json", "{", 0);

  await assert.rejects(
    () => repository.getById("evidence_invalid_json"),
    SqliteCandidateEvidencePayloadError,
  );

  database.prepare("DELETE FROM candidate_evidence").run();
  database
    .prepare("INSERT INTO candidate_evidence (evidence_id, payload, position) VALUES (?, ?, ?)")
    .run("evidence_invalid_domain", JSON.stringify({ ...evidenceVariants[4], name: "" }), 0);
  await assert.rejects(
    () => getCandidateEvidence(repository, "evidence_invalid_domain"),
    InvalidPersistedCandidateEvidenceError,
  );
  database.close();
});
