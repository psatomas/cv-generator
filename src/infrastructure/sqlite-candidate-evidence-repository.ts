import Database from "better-sqlite3";

import {
  CandidateEvidenceAlreadyExistsError,
  CandidateEvidenceNotFoundError,
  type CandidateEvidenceRepository,
} from "../application/candidate-evidence-repository.ts";
import type { CandidateEvidence, EvidenceId } from "../domain/candidate-evidence.ts";

type EvidenceRow = {
  evidence_id: string;
  payload: string;
  position: number;
};

export class SqliteCandidateEvidencePayloadError extends Error {
  public readonly evidenceId: EvidenceId;

  constructor(evidenceId: EvidenceId) {
    super(`Candidate evidence payload is not valid JSON: ${evidenceId}`);
    this.name = "SqliteCandidateEvidencePayloadError";
    this.evidenceId = evidenceId;
  }
}

/**
 * Creates the single-table schema used by the SQLite adapter. `position`
 * records insertion order; reads always order by it explicitly.
 */
export function initializeCandidateEvidenceSqliteSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS candidate_evidence (
      evidence_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      position INTEGER NOT NULL UNIQUE
    );
  `);
}

export class SqliteCandidateEvidenceRepository implements CandidateEvidenceRepository {
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
    initializeCandidateEvidenceSqliteSchema(database);
  }

  public async list(): Promise<readonly unknown[]> {
    const rows = this.database
      .prepare("SELECT evidence_id, payload, position FROM candidate_evidence ORDER BY position ASC")
      .all() as EvidenceRow[];

    return rows.map((row) => deserialize(row.payload, row.evidence_id as EvidenceId));
  }

  public async getById(id: EvidenceId): Promise<unknown | undefined> {
    const row = this.database
      .prepare("SELECT evidence_id, payload, position FROM candidate_evidence WHERE evidence_id = ?")
      .get(id) as EvidenceRow | undefined;

    return row === undefined ? undefined : deserialize(row.payload, id);
  }

  public async save(evidence: CandidateEvidence): Promise<void> {
    const save = this.database.transaction((item: CandidateEvidence) => {
      const existing = this.database
        .prepare("SELECT 1 FROM candidate_evidence WHERE evidence_id = ?")
        .get(item.id);
      if (existing !== undefined) {
        throw new CandidateEvidenceAlreadyExistsError(item.id);
      }

      const position = this.database
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM candidate_evidence")
        .get() as { position: number };
      this.database
        .prepare("INSERT INTO candidate_evidence (evidence_id, payload, position) VALUES (?, ?, ?)")
        .run(item.id, JSON.stringify(item), position.position);
    });

    save(evidence);
  }

  public async replace(evidence: CandidateEvidence): Promise<void> {
    const result = this.database
      .prepare("UPDATE candidate_evidence SET payload = ? WHERE evidence_id = ?")
      .run(JSON.stringify(evidence), evidence.id);
    if (result.changes === 0) {
      throw new CandidateEvidenceNotFoundError(evidence.id);
    }
  }

  public async delete(id: EvidenceId): Promise<void> {
    const result = this.database.prepare("DELETE FROM candidate_evidence WHERE evidence_id = ?").run(id);
    if (result.changes === 0) {
      throw new CandidateEvidenceNotFoundError(id);
    }
  }
}

function deserialize(payload: string, evidenceId: EvidenceId): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    throw new SqliteCandidateEvidencePayloadError(evidenceId);
  }
}
