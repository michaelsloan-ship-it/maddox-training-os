import { describe, expect, it } from "vitest";
import { normalizeUsage } from "./normalize";

describe("provider-neutral usage normalization", () => {
  it("normalizes aggregate and cached tokens", () => {
    expect(normalizeUsage({ inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 })).toEqual({ inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, totalTokens: 120 });
  });
  it("rejects impossible token usage", () => {
    expect(() => normalizeUsage({ inputTokens: 10, cachedInputTokens: 11, outputTokens: 0 })).toThrow("Cached input");
    expect(() => normalizeUsage({ inputTokens: -1, outputTokens: 0 })).toThrow("non-negative");
  });
});
