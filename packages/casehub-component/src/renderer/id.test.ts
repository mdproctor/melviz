import { describe, it, expect } from "vitest";
import { generateId } from "./id.js";

describe("generateId", () => {
  it("returns root for no parent", () => {
    expect(generateId(undefined, undefined, undefined)).toBe("root");
  });

  it("generates slot child ID", () => {
    expect(generateId("root", "main", 0)).toBe("root::main::0");
    expect(generateId("root", "nav", 1)).toBe("root::nav::1");
  });

  it("generates grid item ID", () => {
    expect(generateId("root", 3, 5)).toBe("root::3::5");
  });

  it("handles nested IDs", () => {
    expect(generateId("root::main::0", "default", 2)).toBe("root::main::0::default::2");
  });

  it("avoids collision with underscored slot names", () => {
    const id1 = generateId("root", "a_b", 0);
    const id2 = generateId("root::a", "b", 0);
    expect(id1).not.toBe(id2);
  });
});
