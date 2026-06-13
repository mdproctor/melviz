import { z } from "zod";
import { ColumnType } from "../types.js";
import { HttpMethod } from "./types.js";

const externalColumnDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  type: z.nativeEnum(ColumnType),
});

const externalDataSetDefSchema = z.object({
  uuid: z.string().min(1),
  name: z.string().optional(),

  url: z.string().optional(),
  content: z.string().optional(),
  join: z.array(z.string().min(1)).min(1).optional(),

  method: z.nativeEnum(HttpMethod).optional(),
  headers: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
  form: z.record(z.string()).optional(),
  body: z.string().optional(),

  dataPath: z.string().optional(),
  expression: z.string().optional(),
  type: z.string().optional(),

  columns: z.array(externalColumnDefSchema).optional(),

  cacheEnabled: z.boolean().optional(),
  cacheMaxRows: z.number().int().positive().optional(),
  refreshTime: z.string().regex(
    /^\d+(millisecond|second|minute|hour|day|week|month|quarter|year)$/,
    "Must be a number followed by a time unit (e.g. '10minute', '30second')",
  ).optional(),
  accumulate: z.boolean().optional(),
}).refine(
  d => [d.url, d.content, d.join].filter(Boolean).length === 1,
  { message: "Exactly one of url, content, or join is required" },
).refine(
  d => !(d.form && d.body),
  { message: "form and body are mutually exclusive" },
).refine(
  d => d.url !== undefined || [d.method, d.headers, d.query, d.form, d.body]
    .every(v => v === undefined),
  { message: "method, headers, query, form, body are only valid when url is set" },
).refine(
  d => !d.join || [d.dataPath, d.type, d.expression]
    .every(v => v === undefined),
  { message: "dataPath, type, expression are not valid with join (nothing to extract)" },
).refine(
  d => !d.accumulate || d.url !== undefined,
  { message: "accumulate is only valid when url is set" },
).refine(
  d => !d.refreshTime || d.url !== undefined,
  { message: "refreshTime is only valid when url is set" },
);

export type ParsedExternalDataSetDef = z.output<typeof externalDataSetDefSchema>;

export function parseExternalDataSetDef(input: unknown): ParsedExternalDataSetDef {
  return externalDataSetDefSchema.parse(input);
}
