import assert from "node:assert/strict";
import test from "node:test";

import {
  handleOnePageCvPdfRequest,
  InvalidOnePageCvDocumentRequestError,
  onePageCvPdfFilename,
  parseOnePageCvDocumentRequest,
} from "./cv-pdf-http.ts";
import { type OnePageCvDocument } from "../domain/one-page-cv-document.ts";

const document: OnePageCvDocument = {
  header: { fullName: "Tomás Araújo", email: "tomas@example.com" },
  summary: "Profile",
  sections: [{ kind: "skills", title: "Skills", entries: ["TypeScript"] }],
};

test("validates the limited render-facing document transport shape", () => {
  assert.deepEqual(parseOnePageCvDocumentRequest(document), document);

  for (const input of [
    { ...document, header: {} },
    { ...document, summary: 42 },
    { ...document, sections: [{ kind: "unknown", title: "Skills", entries: [] }] },
    { ...document, sections: [{ kind: "skills", title: "Skills", entries: "TypeScript" }] },
  ]) {
    assert.throws(() => parseOnePageCvDocumentRequest(input), InvalidOnePageCvDocumentRequestError);
  }
});

test("derives deterministic ASCII download filenames", () => {
  assert.equal(onePageCvPdfFilename("Tomás Araújo"), "tomas-araujo-cv.pdf");
  assert.equal(onePageCvPdfFilename(" Alex, Example! "), "alex-example-cv.pdf");
  assert.equal(onePageCvPdfFilename("---"), "cv.pdf");
});

test("passes validated documents to the exporter and returns PDF download headers", async () => {
  let received: OnePageCvDocument | undefined;
  const response = await handleOnePageCvPdfRequest(request(document), {
    exportPdf: async (value) => {
      received = value;
      return Buffer.from("%PDF-test");
    },
  });

  assert.deepEqual(received, document);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="tomas-araujo-cv.pdf"');
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "%PDF-test");
});

test("maps invalid document and exporter failures to safe responses", async () => {
  const invalid = await handleOnePageCvPdfRequest(request({}), {});
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "Invalid CV document." });

  const failure = await handleOnePageCvPdfRequest(request(document), {
    exportPdf: async () => { throw new Error("browser details"); },
  });
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: "PDF export failed." });
});

function request(body: unknown): Request {
  return new Request("http://localhost/api/cv/pdf", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
