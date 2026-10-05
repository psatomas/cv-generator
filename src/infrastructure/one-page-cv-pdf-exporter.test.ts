import assert from "node:assert/strict";
import test from "node:test";

import {
  exportOnePageCvPdf,
  OnePageCvPdfExportError,
  type OnePageCvPdfBrowserLauncher,
} from "./one-page-cv-pdf-exporter.ts";
import { renderOnePageCvHtml } from "./one-page-cv-html-renderer.ts";
import { type OnePageCvDocument } from "../domain/one-page-cv-document.ts";

type FakePdfOptions = {
  format: "A4";
  printBackground: true;
  displayHeaderFooter: false;
  preferCSSPageSize: true;
};

class FakePage {
  public content: string | undefined;
  public options: FakePdfOptions | undefined;
  public closed = false;
  public setContentError: unknown | undefined;
  public pdfError: unknown | undefined;

  public async setContent(html: string): Promise<void> {
    this.content = html;
    if (this.setContentError !== undefined) {
      throw this.setContentError;
    }
  }

  public async pdf(options: FakePdfOptions): Promise<Uint8Array> {
    this.options = options;
    if (this.pdfError !== undefined) {
      throw this.pdfError;
    }

    return Buffer.from("%PDF-fake");
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeBrowser {
  public closed = false;
  private readonly page: FakePage;

  constructor(page: FakePage) {
    this.page = page;
  }

  public async newPage(): Promise<FakePage> {
    return this.page;
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}

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

test("passes renderer HTML and A4 print settings to the browser, then closes resources", async () => {
  const page = new FakePage();
  const browser = new FakeBrowser(page);
  const launcher: OnePageCvPdfBrowserLauncher = async () => browser;

  const pdf = await exportOnePageCvPdf(completeDocument, { launchBrowser: launcher });

  assert.equal(pdf.toString(), "%PDF-fake");
  assert.equal(page.content, renderOnePageCvHtml(completeDocument));
  assert.deepEqual(page.options, {
    format: "A4",
    printBackground: true,
    displayHeaderFooter: false,
    preferCSSPageSize: true,
  });
  assert.equal(page.closed, true);
  assert.equal(browser.closed, true);
});

test("preserves export failures and closes page and browser", async () => {
  const failure = new Error("PDF generation failed");
  const page = new FakePage();
  page.pdfError = failure;
  const browser = new FakeBrowser(page);

  await assert.rejects(
    () => exportOnePageCvPdf(completeDocument, { launchBrowser: async () => browser }),
    (error: unknown) => error instanceof OnePageCvPdfExportError && error.cause === failure,
  );
  assert.equal(page.closed, true);
  assert.equal(browser.closed, true);
});

test("closes page and browser when setting content fails", async () => {
  const page = new FakePage();
  page.setContentError = new Error("content failed");
  const browser = new FakeBrowser(page);

  await assert.rejects(
    () => exportOnePageCvPdf(completeDocument, { launchBrowser: async () => browser }),
    OnePageCvPdfExportError,
  );
  assert.equal(page.closed, true);
  assert.equal(browser.closed, true);
});
