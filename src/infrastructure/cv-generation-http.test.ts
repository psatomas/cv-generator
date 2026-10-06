import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateProfileRequiredError,
} from "../application/one-page-cv-generation.ts";
import {
  handleCvGenerationRequest,
  InvalidCvGenerationRequestError,
  parseJobDescriptionRequest,
  type OnePageCvGenerationRuntime,
} from "./cv-generation-http.ts";
import { type OnePageCvDocument } from "../domain/one-page-cv-document.ts";

const document: OnePageCvDocument = {
  header: { fullName: "Alex Example" },
  summary: null,
  sections: [],
};

test("validates the public job-description transport input", () => {
  assert.deepEqual(parseJobDescriptionRequest({ jobDescription: "  A TypeScript role  " }), {
    text: "  A TypeScript role  ",
  });

  for (const input of [{}, { jobDescription: "" }, { jobDescription: "  " }, { jobDescription: 42 }]) {
    assert.throws(() => parseJobDescriptionRequest(input), InvalidCvGenerationRequestError);
  }
});

test("generates only the canonical document and closes the owned runtime", async () => {
  const runtime = new FakeRuntime(document);
  const response = await handleCvGenerationRequest(request({ jobDescription: "Role" }), {
    createRuntime: () => runtime,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { document });
  assert.deepEqual(runtime.calls, [{ text: "Role" }]);
  assert.equal(runtime.closed, true);
});

test("closes the runtime and maps missing profiles to a safe response", async () => {
  const runtime = new FakeRuntime(document, new CandidateProfileRequiredError());
  const response = await handleCvGenerationRequest(request({ jobDescription: "Role" }), {
    createRuntime: () => runtime,
  });

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "Candidate profile is not configured." });
  assert.equal(runtime.closed, true);
});

test("maps malformed JSON to a safe validation response without creating a runtime", async () => {
  let factoryCalls = 0;
  const response = await handleCvGenerationRequest(new Request("http://localhost/api/cv/generate", {
    method: "POST",
    body: "{",
  }), {
    createRuntime: () => {
      factoryCalls += 1;
      return new FakeRuntime(document);
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Job description must be a non-empty string." });
  assert.equal(factoryCalls, 0);
});

function request(body: unknown): Request {
  return new Request("http://localhost/api/cv/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

class FakeRuntime implements OnePageCvGenerationRuntime {
  public readonly calls: { text: string }[] = [];
  public closed = false;
  private readonly document: OnePageCvDocument;
  private readonly failure: Error | undefined;

  constructor(document: OnePageCvDocument, failure?: Error) {
    this.document = document;
    this.failure = failure;
  }

  public async generateOnePage(jobDescription: { readonly text: string }): Promise<{ document: OnePageCvDocument }> {
    this.calls.push(jobDescription);
    if (this.failure !== undefined) {
      throw this.failure;
    }

    return { document: this.document };
  }

  public close(): void {
    this.closed = true;
  }
}
