import type { DynamicFieldSchema } from "./types";

const normalizeRole = (role?: string) => role?.trim().toLowerCase() || "";

const roleMatches = (allowed: string[] | undefined, role?: string) => {
  if (!allowed?.length) return true;
  const normalized = normalizeRole(role);
  return Boolean(normalized) && allowed.some((value) => normalizeRole(value) === normalized);
};

export const canReadField = (field: DynamicFieldSchema, role?: string) =>
  roleMatches(field.read_roles, role);

export const canWriteField = (field: DynamicFieldSchema, role?: string) =>
  field.type !== "formula" && roleMatches(field.write_roles, role);
