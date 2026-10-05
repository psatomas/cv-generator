import Database from "better-sqlite3";

import {
  CandidateProfileAlreadyExistsError,
  CandidateProfileNotFoundError,
  type CandidateProfileRepository,
} from "../application/candidate-profile-repository.ts";
import type { CandidateProfile } from "../domain/candidate-profile.ts";

type ProfileRow = {
  payload: string;
};

export class SqliteCandidateProfilePayloadError extends Error {
  public readonly issue: string;

  constructor() {
    super("Candidate profile payload is not valid JSON");
    this.name = "SqliteCandidateProfilePayloadError";
    this.issue = "candidate profile payload is not valid JSON";
  }
}

export function initializeCandidateProfileSqliteSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS candidate_profile (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      payload TEXT NOT NULL
    );
  `);
}

export class SqliteCandidateProfileRepository implements CandidateProfileRepository {
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
    initializeCandidateProfileSqliteSchema(database);
  }

  public async get(): Promise<unknown | undefined> {
    const row = this.database
      .prepare("SELECT payload FROM candidate_profile WHERE singleton_id = 1")
      .get() as ProfileRow | undefined;

    return row === undefined ? undefined : deserialize(row.payload);
  }

  public async save(profile: CandidateProfile): Promise<void> {
    try {
      this.database
        .prepare("INSERT INTO candidate_profile (singleton_id, payload) VALUES (1, ?)")
        .run(JSON.stringify(profile));
    } catch (error) {
      if (isConstraintError(error)) {
        throw new CandidateProfileAlreadyExistsError();
      }

      throw error;
    }
  }

  public async replace(profile: CandidateProfile): Promise<void> {
    const result = this.database
      .prepare("UPDATE candidate_profile SET payload = ? WHERE singleton_id = 1")
      .run(JSON.stringify(profile));
    if (result.changes === 0) {
      throw new CandidateProfileNotFoundError();
    }
  }
}

function deserialize(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    throw new SqliteCandidateProfilePayloadError();
  }
}

function isConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" && error.code.startsWith("SQLITE_CONSTRAINT");
}
