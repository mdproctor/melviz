import { describe, it, expect } from "vitest";
import type { AccessControl, PermissionContext } from "../model/types.js";
import { ALLOW_ALL } from "../model/types.js";
import { checkAccess } from "./access.js";

describe("checkAccess", () => {
  const adminOnly: AccessControl = { roles: ["admin"] };
  const readPerm: AccessControl = { permissions: ["read"] };
  const mixed: AccessControl = { roles: ["editor"], permissions: ["write"] };

  const adminCtx: PermissionContext = {
    hasRole: (r) => r === "admin",
    hasPermission: () => false,
  };

  const readerCtx: PermissionContext = {
    hasRole: () => false,
    hasPermission: (p) => p === "read",
  };

  it("allows when no access control", () => {
    expect(checkAccess(undefined, adminCtx)).toBe(true);
  });

  it("allows when role matches", () => {
    expect(checkAccess(adminOnly, adminCtx)).toBe(true);
  });

  it("denies when role does not match", () => {
    expect(checkAccess(adminOnly, readerCtx)).toBe(false);
  });

  it("allows when permission matches", () => {
    expect(checkAccess(readPerm, readerCtx)).toBe(true);
  });

  it("denies when permission does not match", () => {
    expect(checkAccess(readPerm, adminCtx)).toBe(false);
  });

  it("allows with ALLOW_ALL", () => {
    expect(checkAccess(adminOnly, ALLOW_ALL)).toBe(true);
    expect(checkAccess(readPerm, ALLOW_ALL)).toBe(true);
  });

  it("allows when either role or permission matches", () => {
    expect(checkAccess(mixed, adminCtx)).toBe(false);
    expect(checkAccess(mixed, readerCtx)).toBe(false);
    const editorCtx: PermissionContext = {
      hasRole: (r) => r === "editor",
      hasPermission: () => false,
    };
    expect(checkAccess(mixed, editorCtx)).toBe(true);
  });
});
