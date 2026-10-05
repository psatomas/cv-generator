import { type OnePageCvDocument, type OnePageCvSection } from "../domain/one-page-cv-document.ts";

const styles = `
@page {
  size: A4;
  margin: 14mm 16mm;
}

* { box-sizing: border-box; }
html { background: #f3f4f6; }
body {
  margin: 0;
  color: #171717;
  background: #f3f4f6;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 10.5pt;
  line-height: 1.4;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.cv {
  width: min(210mm, 100%);
  min-height: 297mm;
  margin: 20px auto;
  padding: 14mm 16mm;
  background: #ffffff;
}
.cv-header { border-bottom: 1px solid #d4d4d4; padding-bottom: 10px; }
h1, h2, p { margin: 0; }
h1 { font-size: 24pt; line-height: 1.08; letter-spacing: -0.03em; }
.professional-title { margin-top: 3px; color: #404040; font-size: 12pt; font-weight: 600; }
.contact { display: flex; flex-wrap: wrap; gap: 2px 0; margin-top: 8px; color: #525252; font-size: 9.5pt; }
.contact-item + .contact-item::before { content: "·"; margin: 0 7px; color: #a3a3a3; }
a { color: inherit; text-decoration: none; border-bottom: 1px solid #a3a3a3; }
.summary, .cv-section { break-inside: avoid; margin-top: 15px; }
h2 { margin-bottom: 6px; color: #262626; font-size: 10.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.summary p { color: #404040; }
ul { margin: 0; padding-left: 18px; }
li + li { margin-top: 3px; }
.skills-list { display: flex; flex-wrap: wrap; gap: 5px 12px; padding-left: 0; list-style: none; }
.skills-list li { margin: 0; }
@media print {
  html, body { background: #ffffff; }
  .cv { width: auto; min-height: 0; margin: 0; padding: 0; }
  a { border-bottom: 0; }
}
`;

/** Renders only canonical presentation data into a deterministic print-ready HTML document. */
export function renderOnePageCvHtml(document: OnePageCvDocument): string {
  const { header } = document;
  const title = `${header.fullName} — CV`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>
  <main class="cv">
    <header class="cv-header">
      <h1>${escapeHtml(header.fullName)}</h1>${header.professionalTitle === undefined ? "" : `
      <p class="professional-title">${escapeHtml(header.professionalTitle)}</p>`}${renderContact(document)}
    </header>${document.summary === null ? "" : `
    <section class="summary">
      <h2>Profile</h2>
      <p>${escapeHtml(document.summary)}</p>
    </section>`}${document.sections.map(renderSection).join("")}
  </main>
</body>
</html>`;
}

function renderContact(document: OnePageCvDocument): string {
  const { header } = document;
  const values = [
    header.location === undefined ? undefined : escapeHtml(header.location),
    header.email === undefined ? undefined : anchor(`mailto:${header.email}`, header.email),
    header.phone === undefined ? undefined : escapeHtml(header.phone),
    header.githubUrl === undefined ? undefined : anchor(header.githubUrl, displayUrl(header.githubUrl)),
    header.linkedinUrl === undefined ? undefined : anchor(header.linkedinUrl, displayUrl(header.linkedinUrl)),
    header.websiteUrl === undefined ? undefined : anchor(header.websiteUrl, displayUrl(header.websiteUrl)),
  ].filter((value): value is string => value !== undefined);

  return values.length === 0
    ? ""
    : `
      <div class="contact">${values.map((value) => `<span class="contact-item">${value}</span>`).join("")}</div>`;
}

function renderSection(section: OnePageCvSection): string {
  const listClass = section.kind === "skills" ? "skills-list" : "entries-list";
  const entries = section.entries.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");

  return `
    <section class="cv-section">
      <h2>${escapeHtml(section.title)}</h2>
      <ul class="${listClass}">${entries}</ul>
    </section>`;
}

function anchor(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
}

function displayUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${host}${path}${url.search}${url.hash}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
