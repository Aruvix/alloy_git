import { describe, expect, it } from "vitest";
import { maskSecrets } from "./service.js";

describe("maskSecrets", () => {
  it("masks token-like values while preserving surrounding text", () => {
    expect(maskSecrets("token = ghp_abcdefghijklmnopqrstuvwxyz")).toBe("token = ********");
  });

  it("masks authorization bearer values", () => {
    expect(maskSecrets("Authorization: Bearer abcdefghijklmnop")).toContain("********");
  });
});
