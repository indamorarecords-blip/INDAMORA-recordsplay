import { describe, it } from "node:test";
import assert from "node:assert/strict";
function readObjectMetadata(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new Error("object metadata response");
  }
  const metadata =
    payload.metadata &&
    typeof payload.metadata === "object" &&
    !Array.isArray(payload.metadata)
      ? payload.metadata
      : {};
  const size = Number(payload.size ?? metadata.size);
  const contentType = String(
    payload.content_type ??
    payload.contentType ??
    metadata.mimetype ??
    metadata.contentType ??
    metadata.content_type ??
    ""
  );
  if (!Number.isSafeInteger(size) || size < 1 || !contentType) {
    throw new Error("object metadata response");
  }
  return {
    size,
    contentType: contentType.trim().toLowerCase().split(";")[0],
  };
}
describe("Supabase Storage metadata", () => {
  it("reads top-level metadata", () => {
    assert.deepEqual(
      readObjectMetadata({
        size: 2048,
        content_type: "audio/mpeg",
      }),
      {
        size: 2048,
        contentType: "audio/mpeg",
      }
    );
  });
  it("reads nested metadata", () => {
    assert.deepEqual(
      readObjectMetadata({
        metadata: {
          size: 4096,
          mimetype: "image/jpeg",
        },
      }),
      {
        size: 4096,
        contentType: "image/jpeg",
      }
    );
  });
  it("rejects incomplete metadata", () => {
    assert.throws(
      () => readObjectMetadata({ size: 0 }),
      /object metadata response/
    );
  });
});
