import assert from "node:assert/strict";
import test from "node:test";

import { renderOnePageCvHtml } from "./one-page-cv-html-renderer.ts";
import { type OnePageCvDocument } from "../domain/one-page-cv-document.ts";

const completeDocument: OnePageCvDocument = {
  header: {
    fullName: "Alex Example",
    professionalTitle: "Protocol Engineer",
    location: "Recife, Brazil",
    email: "alex@example.com",
    phone: "+55 81 99999-9999",
    githubUrl: "https://github.com/example",
    linkedinUrl: "https://www.linkedin.com/in/example",
    websiteUrl: "https://example.dev",
  },
  summary: "Builds reliable protocol systems.",
  sections: [
    { kind: "certifications", title: "Credentials", entries: ["Cloud Practitioner", "Security Training"] },
    { kind: "skills", title: "Core Skills", entries: ["TypeScript", "Solidity"] },
    { kind: "statements", title: "Selected Work", entries: ["Built verification controls.", "Implemented protocol tooling."] },
  ],
};

test("renders a complete HTML shell with full profile, links, summary, and sections", () => {
  const html = renderOnePageCvHtml(completeDocument);

  for (const fragment of [
    "<!doctype html>",
    '<html lang="en">',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<style>",
    "<body>",
    "<main class=\"cv\">",
    "<h1>Alex Example</h1>",
    "Protocol Engineer",
    "Recife, Brazil",
    'href="mailto:alex@example.com"',
    'href="https://github.com/example"',
    'href="https://www.linkedin.com/in/example"',
    'href="https://example.dev"',
    "github.com/example",
    "linkedin.com/in/example",
    "example.dev",
    "<h2>Profile</h2>",
    "Builds reliable protocol systems.",
  ]) {
    assert.ok(html.includes(fragment), `expected HTML to include ${fragment}`);
  }
});

test("omits optional profile values and summary markup when they are absent", () => {
  const html = renderOnePageCvHtml({
    header: { fullName: "Alex Example" },
    summary: null,
    sections: [],
  });

  assert.equal(html.includes('class="contact"'), false);
  assert.equal(html.includes('class="professional-title"'), false);
  assert.equal(html.includes("<h2>Profile</h2>"), false);
  assert.equal(html.includes("mailto:"), false);
  assert.equal(html.includes('<span class="contact-item">'), false);
});

test("preserves canonical section and entry order without regrouping", () => {
  const html = renderOnePageCvHtml(completeDocument);

  assertOrder(html, ["Credentials", "Core Skills", "Selected Work"]);
  assertOrder(html, ["Cloud Practitioner", "Security Training"]);
  assertOrder(html, ["TypeScript", "Solidity"]);
  assertOrder(html, ["Built verification controls.", "Implemented protocol tooling."]);
  assert.ok(html.includes('<ul class="skills-list"><li>TypeScript</li><li>Solidity</li></ul>'));
  assert.ok(html.includes('<ul class="entries-list"><li>Cloud Practitioner</li><li>Security Training</li></ul>'));
});

test("escapes candidate and generated text, including script-like content", () => {
  const malicious = '<script>alert("x")</script>';
  const html = renderOnePageCvHtml({
    header: {
      fullName: malicious,
      professionalTitle: `Title & ${malicious}`,
      location: `Location ' ${malicious}`,
    },
    summary: malicious,
    sections: [{ kind: "statements", title: malicious, entries: [malicious] }],
  });

  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert.equal(html.includes("<script>alert"), false);
  assert.ok(html.includes("&#39;"));
  assert.ok(html.includes("&amp;"));
});

test("is deterministic, preserves input values, and includes A4 print CSS", () => {
  const before = JSON.stringify(completeDocument);
  const first = renderOnePageCvHtml(completeDocument);
  const second = renderOnePageCvHtml(completeDocument);

  assert.equal(first, second);
  assert.equal(JSON.stringify(completeDocument), before);
  assert.ok(first.includes("@page"));
  assert.ok(first.includes("size: A4"));
  assert.ok(first.includes("break-inside: avoid"));
  assert.ok(first.includes("print-color-adjust"));
});

function assertOrder(value: string, fragments: readonly string[]): void {
  let previous = -1;
  for (const fragment of fragments) {
    const index = value.indexOf(fragment);
    assert.ok(index > previous, `expected ${fragment} after the preceding fragment`);
    previous = index;
  }
}
