import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateProfileValidationError,
  parseCandidateProfile,
} from "./candidate-profile.ts";

const completeProfile = {
  fullName: "Alex Example",
  professionalTitle: "Protocol Engineer",
  location: "Recife, Brazil",
  email: "alex@example.com",
  phone: "+55 81 99999-9999",
  githubUrl: "https://github.com/example",
  linkedinUrl: "https://www.linkedin.com/in/example",
  websiteUrl: "https://example.dev",
};

test("parses a minimal profile with full name only", () => {
  assert.deepEqual(parseCandidateProfile({ fullName: "Alex Example" }), {
    fullName: "Alex Example",
    professionalTitle: undefined,
    location: undefined,
    email: undefined,
    phone: undefined,
    githubUrl: undefined,
    linkedinUrl: undefined,
    websiteUrl: undefined,
  });
});

test("parses a complete profile and trims canonical string values", () => {
  const profile = parseCandidateProfile({
    ...completeProfile,
    fullName: "  Alex Example  ",
    professionalTitle: "  Protocol Engineer ",
    location: " Recife, Brazil ",
    email: " alex@example.com ",
    phone: " +55 81 99999-9999 ",
    githubUrl: " https://github.com/example ",
    linkedinUrl: " https://www.linkedin.com/in/example ",
    websiteUrl: " https://example.dev ",
  });

  assert.deepEqual(profile, completeProfile);
});

test("rejects missing, blank, and malformed required or optional text fields", () => {
  for (const input of [
    {},
    { fullName: " " },
    { fullName: "Alex Example", professionalTitle: " " },
    { fullName: "Alex Example", location: " " },
    { fullName: "Alex Example", phone: " " },
  ]) {
    assert.throws(() => parseCandidateProfile(input), CandidateProfileValidationError);
  }
});

test("validates email addresses conservatively", () => {
  assert.equal(parseCandidateProfile({ fullName: "Alex Example", email: "alex@example.com" }).email, "alex@example.com");
  for (const email of ["alex", "alex@", "@example.com", "alex example@example.com", " "]) {
    assert.throws(
      () => parseCandidateProfile({ fullName: "Alex Example", email }),
      CandidateProfileValidationError,
    );
  }
});

test("validates GitHub and LinkedIn URLs using exact allowed hostnames", () => {
  assert.equal(
    parseCandidateProfile({ fullName: "Alex Example", githubUrl: "https://github.com/example" }).githubUrl,
    "https://github.com/example",
  );
  assert.equal(
    parseCandidateProfile({ fullName: "Alex Example", linkedinUrl: "https://www.linkedin.com/in/example" }).linkedinUrl,
    "https://www.linkedin.com/in/example",
  );
  for (const input of [
    { githubUrl: "https://github.com.example.com/example" },
    { linkedinUrl: "https://linkedin.com.example.com/in/example" },
  ]) {
    assert.throws(
      () => parseCandidateProfile({ fullName: "Alex Example", ...input }),
      CandidateProfileValidationError,
    );
  }
});

test("accepts HTTP(S) website URLs and rejects other or malformed schemes", () => {
  assert.equal(
    parseCandidateProfile({ fullName: "Alex Example", websiteUrl: "http://example.dev" }).websiteUrl,
    "http://example.dev",
  );
  assert.equal(
    parseCandidateProfile({ fullName: "Alex Example", websiteUrl: "https://example.dev" }).websiteUrl,
    "https://example.dev",
  );
  for (const websiteUrl of ["ftp://example.dev", "not a URL"]) {
    assert.throws(
      () => parseCandidateProfile({ fullName: "Alex Example", websiteUrl }),
      CandidateProfileValidationError,
    );
  }
});

test("rejects null, array, and scalar inputs", () => {
  for (const input of [null, [], "Alex Example", 1]) {
    assert.throws(() => parseCandidateProfile(input), CandidateProfileValidationError);
  }
});

test("returns a runtime-frozen canonical profile", () => {
  const profile = parseCandidateProfile(completeProfile);

  assert.throws(() => {
    (profile as { fullName: string }).fullName = "Changed";
  }, TypeError);
  assert.equal(profile.fullName, "Alex Example");
});
