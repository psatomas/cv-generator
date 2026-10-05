import assert from "node:assert/strict";
import test from "node:test";

import { exportOnePageCvPdf } from "./one-page-cv-pdf-exporter.ts";
import { type OnePageCvDocument } from "../domain/one-page-cv-document.ts";

const completeDocument: OnePageCvDocument = {
  header: {
    fullName: "Alex Example",
    professionalTitle: "Protocol Engineer",
    location: "Recife, Brazil",
  },
  summary: "Builds reliable protocol systems.",
  sections: [
    { kind: "skills", title: "Skills", entries: ["TypeScript"] },
    { kind: "statements", title: "Relevant Experience", entries: ["Built verification controls."] },
    { kind: "certifications", title: "Certifications", entries: ["Cloud Practitioner"] },
  ],
};

test("exports valid PDF bytes for complete and minimal documents using Chromium", async () => {
  const complete = await exportOnePageCvPdf(completeDocument);
  const minimal = await exportOnePageCvPdf({
    header: { fullName: "Alex Example" },
    summary: null,
    sections: [],
  });

  for (const pdf of [complete, minimal]) {
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 500, "expected a non-empty PDF");
  }
});
