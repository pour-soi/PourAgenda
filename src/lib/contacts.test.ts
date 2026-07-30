import { describe, expect, it } from "vitest";
import { contactInput, escapePostgrestSearch } from "./contacts";

describe("contacts", () => {
  it("validates contact fields", () => {
    expect(contactInput.safeParse({ name: "Ada", email: "ada@example.com" }).success).toBe(true);
    expect(contactInput.safeParse({ name: "", email: "bad" }).success).toBe(false);
  });

  it("removes PostgREST filter control characters", () => {
    expect(escapePostgrestSearch("Ada%,_(Lovelace)")).toBe("Ada Lovelace");
  });
});
