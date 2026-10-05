import Database from "better-sqlite3";
import OpenAI from "openai";

import {
  generateCvForJob,
  type CvGenerationResult,
} from "../application/cv-generation.ts";
import { type JobDescription } from "../application/job-requirement-extraction.ts";
import {
  OpenAICvComposer,
  type OpenAICvResponsesClient,
} from "./openai-cv-composer.ts";
import {
  OpenAIJobRequirementExtractor,
  type OpenAIResponsesClient,
} from "./openai-job-requirement-extractor.ts";
import { SqliteCandidateEvidenceRepository } from "./sqlite-candidate-evidence-repository.ts";

export type CvGenerationOpenAIResponsesClient =
  & OpenAIResponsesClient
  & OpenAICvResponsesClient;

export type CreateCvGenerationRuntimeConfig = {
  /** The caller retains ownership of this already-open SQLite connection. */
  readonly database: Database.Database;
  readonly openAIClient: CvGenerationOpenAIResponsesClient;
  readonly requirementModel?: string;
  readonly compositionModel?: string;
};

export type CvGenerationRuntime = Readonly<{
  generate(jobDescription: JobDescription): Promise<CvGenerationResult>;
}>;

export type OwnedCvGenerationRuntime = CvGenerationRuntime & Readonly<{
  /** Closes the SQLite connection opened by the environment helper. */
  close(): void;
}>;

export type CreateCvGenerationRuntimeFromEnvironmentConfig = {
  readonly databasePath?: string;
  readonly apiKey?: string;
  readonly requirementModel?: string;
  readonly compositionModel?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
};

export class CvGenerationBootstrapConfigurationError extends Error {
  public readonly issue: string;

  constructor(issue: string) {
    super(`CV generation bootstrap configuration error: ${issue}`);
    this.name = "CvGenerationBootstrapConfigurationError";
    this.issue = issue;
  }
}

/**
 * Composition root for an already-open SQLite database and an injected OpenAI
 * Responses client. It only wires concrete adapters to the application flow.
 */
export function createCvGenerationRuntime(
  config: CreateCvGenerationRuntimeConfig,
): CvGenerationRuntime {
  const evidenceRepository = new SqliteCandidateEvidenceRepository(config.database);
  const extractor = new OpenAIJobRequirementExtractor({
    client: config.openAIClient,
    model: config.requirementModel,
  });
  const composer = new OpenAICvComposer({
    client: config.openAIClient,
    model: config.compositionModel,
  });

  return Object.freeze({
    generate: (jobDescription) => generateCvForJob({
      jobDescription,
      evidenceRepository,
      extractor,
      composer,
    }),
  });
}

/**
 * Opens and owns a SQLite connection configured for production use. The
 * returned close operation releases only this helper-created connection.
 */
export function createCvGenerationRuntimeFromEnvironment(
  config: CreateCvGenerationRuntimeFromEnvironmentConfig = {},
): OwnedCvGenerationRuntime {
  const environment = config.environment ?? process.env;
  const databasePath = requiredText(
    config.databasePath ?? environment.CV_GENERATOR_DATABASE_PATH,
    "CV_GENERATOR_DATABASE_PATH",
  );
  const apiKey = requiredText(config.apiKey ?? environment.OPENAI_API_KEY, "OPENAI_API_KEY");

  let database: Database.Database;
  try {
    database = new Database(databasePath);
  } catch {
    throw new CvGenerationBootstrapConfigurationError(
      "CV_GENERATOR_DATABASE_PATH could not open a SQLite database",
    );
  }

  try {
    const runtime = createCvGenerationRuntime({
      database,
      openAIClient: new OpenAI({ apiKey }),
      requirementModel: config.requirementModel,
      compositionModel: config.compositionModel,
    });

    return Object.freeze({ ...runtime, close: () => database.close() });
  } catch (error) {
    database.close();
    throw error;
  }
}

function requiredText(value: string | undefined, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CvGenerationBootstrapConfigurationError(`${name} is required`);
  }

  return value.trim();
}
