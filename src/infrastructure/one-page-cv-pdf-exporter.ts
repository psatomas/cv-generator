import { chromium } from "playwright";

import { type OnePageCvDocument } from "../domain/one-page-cv-document.ts";
import { renderOnePageCvHtml } from "./one-page-cv-html-renderer.ts";

type PdfOptions = Readonly<{
  format: "A4";
  printBackground: true;
  displayHeaderFooter: false;
  preferCSSPageSize: true;
}>;

type OnePageCvPdfPage = {
  setContent(html: string): Promise<void>;
  pdf(options: PdfOptions): Promise<Uint8Array>;
  close(): Promise<void>;
};

type OnePageCvPdfBrowser = {
  newPage(): Promise<OnePageCvPdfPage>;
  close(): Promise<void>;
};

export type OnePageCvPdfBrowserLauncher = () => Promise<OnePageCvPdfBrowser>;

/** Optional launcher injection keeps browser lifecycle behavior unit-testable. */
export type OnePageCvPdfExportOptions = Readonly<{
  launchBrowser?: OnePageCvPdfBrowserLauncher;
}>;

export class OnePageCvPdfExportError extends Error {
  public readonly cause: unknown;

  constructor(cause: unknown) {
    super("One-page CV PDF export failed");
    this.name = "OnePageCvPdfExportError";
    this.cause = cause;
  }
}

const pdfOptions: PdfOptions = Object.freeze({
  format: "A4",
  printBackground: true,
  displayHeaderFooter: false,
  preferCSSPageSize: true,
});

/** Converts canonical document data through the single HTML renderer into PDF bytes. */
export async function exportOnePageCvPdf(
  document: OnePageCvDocument,
  options: OnePageCvPdfExportOptions = {},
): Promise<Buffer> {
  const html = renderOnePageCvHtml(document);
  const launchBrowser = options.launchBrowser ?? (() => chromium.launch({ headless: true }));
  let browser: OnePageCvPdfBrowser | undefined;
  let page: OnePageCvPdfPage | undefined;

  try {
    browser = await launchBrowser();
    page = await browser.newPage();
    await page.setContent(html);
    return Buffer.from(await page.pdf(pdfOptions));
  } catch (error) {
    throw new OnePageCvPdfExportError(error);
  } finally {
    try {
      if (page !== undefined) {
        await page.close();
      }
    } finally {
      if (browser !== undefined) {
        await browser.close();
      }
    }
  }
}
