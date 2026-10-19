import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { compactModel, modelText, vehicleText } from "./format.js";
import { guide } from "./guide.js";
import type { Bucket, RateLimiter } from "./limits.js";
import { COUNTRY_CODES, type Caller, type PlateopClient } from "./plateop.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};
const ok = (text: string, data: unknown): ToolResult => ({ content: [{ type: "text", text }], structuredContent: data as Record<string, unknown> });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

export interface McpDeps {
  plateop: PlateopClient;
  limiter: RateLimiter;
  ipHash: string;
  caller: Caller;
  /** One log line per call: tool, country, outcome. Never the plate. */
  log: (line: string) => void;
}

const country = z.enum(COUNTRY_CODES).describe("Country of the register: nl, gb, il, is or dk");
const language = z.string().regex(/^[a-z]{2}$/i).optional().describe("Optional two-letter language for the texts, for example nl, en, he, is, da. Unsupported values fall back to the country's default.");

/** Builds an MCP server for ONE request (stateless transport). */
export function createMcpServer(d: McpDeps): McpServer {
  const server = new McpServer(
    { name: "plateop-check", title: "Plateop vehicle check", version: "0.1.1" },
    { instructions: "Free facts about a used car from the official register (NL, GB, IL, IS, DK), each with source and date, and model-wide inspection statistics. Read resource plateop://guide." },
  );

  const run = async (tool: string, bucket: Bucket, c: string, fn: () => Promise<ToolResult>): Promise<ToolResult> => {
    const lim = d.limiter.check(d.ipHash, bucket);
    if (!lim.ok) {
      d.log(`tool=${tool} country=${c} result=limited ip=${d.ipHash.slice(0, 12)}`);
      return fail(`Rate limit reached for ${tool}. Try again in ${lim.retryAfterSec} seconds.`);
    }
    const res = await fn();
    d.log(`tool=${tool} country=${c} result=${res.isError ? "error" : "ok"} ip=${d.ipHash.slice(0, 12)}`);
    return res;
  };

  server.registerResource(
    "guide",
    "plateop://guide",
    { title: "Plateop vehicle check guide", description: "What the tools do, countries, limits, licence", mimeType: "text/plain" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/plain", text: guide() }] }),
  );

  server.registerTool(
    "vehicle_check",
    {
      title: "Check a vehicle by plate",
      description:
        "Free facts about one used car from the official register: vehicle data, periodic inspection due date, odometer verdict, insurance, inspection findings and recalls, each with source and as-of date. Also returns the link where a person can start the full paid report. Countries: nl, gb, il, is, dk.",
      inputSchema: {
        plate: z.string().min(1).max(20).describe("Number plate. Spaces, dashes and case are fine."),
        country,
        language,
      },
      annotations: { title: "Check a vehicle by plate", ...READ_ONLY },
    },
    ({ plate, country: c, language: l }) =>
      run("vehicle_check", "vehicle", c, async () => {
        const r = await d.plateop.vehicle(c, plate, l, d.caller);
        return r.ok ? ok(vehicleText(r.data, c), r.data) : fail(r.message);
      }),
  );

  server.registerTool(
    "model_inspection_stats",
    {
      title: "Inspection statistics for a car model",
      description:
        "Model-wide periodic inspection statistics (how often a make and model fails or gets findings), with source, as-of date and the citation line to use. Not about one specific car: for that use vehicle_check.",
      inputSchema: {
        brand: z.string().min(1).max(60).describe("Make, for example Volkswagen"),
        model: z.string().min(1).max(60).describe("Model, for example Golf"),
        country,
        language,
      },
      annotations: { title: "Inspection statistics for a car model", ...READ_ONLY },
    },
    ({ brand, model, country: c, language: l }) =>
      run("model_inspection_stats", "model", c, async () => {
        const r = await d.plateop.model(c, brand, model, l, d.caller);
        if (!r.ok) return fail(r.message);
        const compact = compactModel(r.data, c);
        return ok(modelText(compact, c), compact);
      }),
  );

  return server;
}
