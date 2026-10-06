"use client";

import { FormEvent, useState } from "react";

import { type OnePageCvDocument } from "../domain/one-page-cv-document.ts";

type ErrorResponse = { error?: unknown };
type GenerateResponse = { document?: unknown };

export function CvGenerator() {
  const [jobDescription, setJobDescription] = useState("");
  const [document, setDocument] = useState<OnePageCvDocument | null>(null);
  const [generationPending, setGenerationPending] = useState(false);
  const [pdfPending, setPdfPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (jobDescription.trim().length === 0) {
      setError("Enter a job description.");
      return;
    }

    setGenerationPending(true);
    setError(null);
    try {
      const response = await fetch("/api/cv/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });
      const payload = await response.json() as GenerateResponse & ErrorResponse;
      if (!response.ok || !isDocument(payload.document)) {
        throw new Error(errorMessage(payload, "Unable to generate the CV."));
      }

      setDocument(payload.document);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to generate the CV.");
    } finally {
      setGenerationPending(false);
    }
  }

  async function downloadPdf(): Promise<void> {
    if (document === null) {
      return;
    }

    setPdfPending(true);
    setError(null);
    try {
      const response = await fetch("/api/cv/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document }),
      });
      if (!response.ok) {
        const payload = await response.json() as ErrorResponse;
        throw new Error(errorMessage(payload, "Unable to export the PDF."));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = filename(response.headers.get("Content-Disposition"));
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to export the PDF.");
    } finally {
      setPdfPending(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:py-16">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold tracking-wide text-zinc-600 uppercase">CV Generator</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">Generate a grounded CV.</h1>
        <p className="mt-3 text-lg leading-8 text-zinc-600">Paste a job description to generate a tailored CV from your persisted profile and evidence.</p>
      </header>

      <form className="mt-10 max-w-3xl space-y-4" onSubmit={generate}>
        <label className="block text-sm font-semibold text-zinc-900" htmlFor="job-description">Job description</label>
        <textarea
          className="min-h-64 w-full rounded-lg border border-zinc-300 bg-white p-4 text-sm leading-6 text-zinc-950 shadow-sm outline-none transition focus:border-zinc-700 focus:ring-2 focus:ring-zinc-200"
          id="job-description"
          onChange={(event) => setJobDescription(event.target.value)}
          placeholder="Paste the job description here..."
          value={jobDescription}
        />
        <button className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400" disabled={generationPending} type="submit">
          {generationPending ? "Generating..." : "Generate CV"}
        </button>
      </form>

      {error === null ? null : <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

      {document === null ? null : (
        <section className="mt-14 border-t border-zinc-200 pt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Preview</h2>
            <button className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-400" disabled={pdfPending} onClick={downloadPdf} type="button">
              {pdfPending ? "Preparing PDF..." : "Download PDF"}
            </button>
          </div>
          <OnePageCvPreview document={document} />
        </section>
      )}
    </main>
  );
}

function OnePageCvPreview({ document }: { readonly document: OnePageCvDocument }) {
  const { header } = document;
  const contact = [
    header.location,
    header.email === undefined ? undefined : <a href={`mailto:${header.email}`} key="email">{header.email}</a>,
    header.phone,
    header.githubUrl === undefined ? undefined : <a href={header.githubUrl} key="github">{header.githubUrl}</a>,
    header.linkedinUrl === undefined ? undefined : <a href={header.linkedinUrl} key="linkedin">{header.linkedinUrl}</a>,
    header.websiteUrl === undefined ? undefined : <a href={header.websiteUrl} key="website">{header.websiteUrl}</a>,
  ].filter((value): value is string | React.ReactElement => value !== undefined);

  return (
    <article className="mt-6 max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-9">
      <header className="border-b border-zinc-200 pb-5">
        <h3 className="text-3xl font-semibold tracking-tight text-zinc-950">{header.fullName}</h3>
        {header.professionalTitle === undefined ? null : <p className="mt-1 font-medium text-zinc-700">{header.professionalTitle}</p>}
        {contact.length === 0 ? null : <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-600">{contact.map((value, index) => <span key={typeof value === "string" ? `${value}-${index}` : value.key}>{value}</span>)}</p>}
      </header>
      {document.summary === null ? null : <section className="mt-7"><h4 className="text-sm font-bold tracking-wide text-zinc-900 uppercase">Profile</h4><p className="mt-2 leading-7 text-zinc-700">{document.summary}</p></section>}
      {document.sections.map((section) => (
        <section className="mt-7" key={`${section.kind}-${section.title}`}>
          <h4 className="text-sm font-bold tracking-wide text-zinc-900 uppercase">{section.title}</h4>
          <ul className={section.kind === "skills" ? "mt-3 flex flex-wrap gap-x-4 gap-y-2 text-zinc-700" : "mt-3 list-disc space-y-2 pl-5 text-zinc-700"}>
            {section.entries.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
          </ul>
        </section>
      ))}
    </article>
  );
}

function errorMessage(payload: ErrorResponse, fallback: string): string {
  return typeof payload.error === "string" ? payload.error : fallback;
}

function filename(contentDisposition: string | null): string {
  const match = /filename="?([^";]+)"?/.exec(contentDisposition ?? "");
  return match?.[1] ?? "cv.pdf";
}

function isDocument(value: unknown): value is OnePageCvDocument {
  return typeof value === "object" && value !== null && "header" in value && "sections" in value;
}
