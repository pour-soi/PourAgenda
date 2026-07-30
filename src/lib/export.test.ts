import { describe, expect, it } from "vitest";
import { csv } from "./export";
describe("CSV export", () => {
  it("escapes quotes and formula-like cells", () => {
    expect(csv([{ name: "=cmd", notes: 'a,"b"' }])).toContain("\"'=cmd\"");
    expect(csv([{ name: "=cmd", notes: 'a,\"b\"' }])).toContain("\"a,\"\"b\"\"\"");
  });
  it("protects every spreadsheet formula prefix and preserves line breaks", () => {
    const value = csv([{ a: "+SUM(1)", b: "-1", c: "@cmd", d: "line1\nline2" }]);
    expect(value).toContain("\"'+SUM(1)\"");
    expect(value).toContain("\"'-1\"");
    expect(value).toContain("\"'@cmd\"");
    expect(value).toContain("\"line1\nline2\"");
  });
});
