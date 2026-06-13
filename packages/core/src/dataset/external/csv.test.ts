import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("parses simple CSV with header row", () => {
    const result = parseCsv("name,age\nAlice,30\nBob,25");
    expect(result.headers).toEqual(["name", "age"]);
    expect(result.rows).toEqual([["Alice", "30"], ["Bob", "25"]]);
  });

  it("parses CSV without header row", () => {
    const result = parseCsv("Alice,30\nBob,25", { hasHeader: false });
    expect(result.headers).toEqual(["Column 0", "Column 1"]);
    expect(result.rows).toEqual([["Alice", "30"], ["Bob", "25"]]);
  });

  it("handles quoted fields containing commas", () => {
    const result = parseCsv('name,address\nAlice,"123 Main St, Apt 4"\nBob,"456 Oak Ave"');
    expect(result.rows[0]).toEqual(["Alice", "123 Main St, Apt 4"]);
  });

  it("handles quoted fields containing newlines", () => {
    const result = parseCsv('name,note\nAlice,"line1\nline2"\nBob,simple');
    expect(result.rows[0]).toEqual(["Alice", "line1\nline2"]);
    expect(result.rows[1]).toEqual(["Bob", "simple"]);
  });

  it("handles escaped quotes (doubled quotes)", () => {
    const result = parseCsv('name,quote\nAlice,"She said ""hello"""\nBob,plain');
    expect(result.rows[0]).toEqual(["Alice", 'She said "hello"']);
  });

  it("skips empty lines", () => {
    const result = parseCsv("name,age\nAlice,30\n\nBob,25\n");
    expect(result.rows).toHaveLength(2);
  });

  it("handles \\r\\n line endings", () => {
    const result = parseCsv("name,age\r\nAlice,30\r\nBob,25");
    expect(result.headers).toEqual(["name", "age"]);
    expect(result.rows).toEqual([["Alice", "30"], ["Bob", "25"]]);
  });

  it("handles trailing delimiter producing empty final field", () => {
    const result = parseCsv("a,b,\n1,2,", { hasHeader: false });
    expect(result.headers).toEqual(["Column 0", "Column 1", "Column 2"]);
    expect(result.rows[0]).toEqual(["a", "b", ""]);
    expect(result.rows[1]).toEqual(["1", "2", ""]);
  });

  it("supports custom delimiter", () => {
    const result = parseCsv("name\tage\nAlice\t30", { delimiter: "\t" });
    expect(result.headers).toEqual(["name", "age"]);
    expect(result.rows[0]).toEqual(["Alice", "30"]);
  });

  it("handles single-row CSV (header only, no data)", () => {
    const result = parseCsv("name,age");
    expect(result.headers).toEqual(["name", "age"]);
    expect(result.rows).toEqual([]);
  });

  it("handles whitespace-only fields", () => {
    const result = parseCsv("a,b\n , ");
    expect(result.rows[0]).toEqual([" ", " "]);
  });
});
