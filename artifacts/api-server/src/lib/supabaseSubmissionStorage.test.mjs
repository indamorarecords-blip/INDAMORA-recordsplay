import assert from "node:assert/strict";
import test from "node:test";
import { decodeSubmissionNote, encodeSubmissionNote } from "./submissionMetadata.ts";

test("encodes new metadata in the existing note field and returns a clean description", () => {
  const metadata = {
    description: "Une chanson dédiée à ma famille.",
    album: "Premier album",
    genre: "Afropop",
    releaseYear: 2026,
    termsAcceptedAt: "2026-11-07T12:00:00.000Z",
  };
  const stored = encodeSubmissionNote(metadata);
  assert.notEqual(stored, metadata.description);
  assert.deepEqual(decodeSubmissionNote(stored), metadata);
});

test("keeps legacy notes unchanged and supplies empty metadata", () => {
  assert.deepEqual(decodeSubmissionNote("Ancienne note de présentation."), {
    description: "Ancienne note de présentation.",
    album: null,
    genre: null,
    releaseYear: null,
    termsAcceptedAt: null,
  });
  assert.equal(decodeSubmissionNote(null).description, "");
});

test("does not hide an invalid metadata marker inside legacy text", () => {
  const malformed = "Texte\n\n[[INDAMORA_SUBMISSION_METADATA_V1:broken]]";
  assert.deepEqual(decodeSubmissionNote(malformed), {
    description: malformed,
    album: null,
    genre: null,
    releaseYear: null,
    termsAcceptedAt: null,
  });
});
