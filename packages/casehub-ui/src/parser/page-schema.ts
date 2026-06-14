import { z } from "zod";

/**
 * Minimal Zod schema for the root YAML dashboard structure.
 *
 * Validates basic shape only — the heavy lifting (desugaring, nav resolution,
 * property substitution) is done by parsePage and its sub-modules.
 */
export const yamlRootPageSchema = z
  .object({
    pages: z.array(z.unknown()).min(1).optional(),
    layoutTemplates: z.array(z.unknown()).min(1).optional(),
    datasets: z.array(z.unknown()).optional(),
    global: z.record(z.unknown()).optional(),
    properties: z.record(z.string()).optional(),
    navTree: z.unknown().optional(),
  })
  .refine(
    (d) =>
      (d.pages !== undefined && d.pages.length > 0) ||
      (d.layoutTemplates !== undefined && d.layoutTemplates.length > 0),
    { message: "At least one page is required (pages or layoutTemplates)" },
  );
