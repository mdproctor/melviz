import type { AccessControl, PermissionContext } from "../model/types.js";

export function checkAccess(
  access: AccessControl | undefined,
  permissions: PermissionContext,
): boolean {
  if (!access) return true;

  if (access.roles && access.roles.length > 0) {
    if (access.roles.some((r) => permissions.hasRole(r))) return true;
  }

  if (access.permissions && access.permissions.length > 0) {
    if (access.permissions.some((p) => permissions.hasPermission(p))) return true;
  }

  if ((!access.roles || access.roles.length === 0) &&
      (!access.permissions || access.permissions.length === 0)) {
    return true;
  }

  return false;
}
