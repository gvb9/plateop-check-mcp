import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createHash, randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Config } from "./config.js";
import { guide } from "./guide.js";
import { RateLimiter } from "./limits.js";
import { createMcpServer } from "./mcp.js";
import { PlateopClient } from "./plateop.js";
import { renderPrivacy } from "./privacy.js";

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

// Static files shipped with the code (icon). Resolved from this module so it works from src/ (tsx) and dist/.
const STATIC_DIR = fileURLToPath(new URL("../static/", import.meta.url));

export async function startServer(cfg: Config, log: (line: string) => void = (l) => console.log(l)): Promise<RunningServer> {
  const limiter = new RateLimiter(cfg.now ?? Date.now);
  const plateop = new PlateopClient(cfg);
  const salt = cfg.ipSalt ?? randomBytes(32).toString("hex");

  // Same reading as the Plateop app: X-Real-IP first, else the last X-Forwarded-For hop (the one nginx appended).
  const ipOf = (req: Request): string => {
    if (cfg.trustProxy) {
      const real = req.header("x-real-ip")?.trim();
      if (real) return real;
      const hops = (req.header("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
      if (hops.length) return hops[hops.length - 1];
    }
    return req.socket.remoteAddress ?? "unknown";
  };
  const hashOf = (ip: string) => createHash("sha256").update(salt + ip).digest("hex");

  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Protocol-Version, Mcp-Session-Id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    if (req.method === "OPTIONS") return void res.status(204).end();
    next();
  });

  const text = (res: Response, body: string, status = 200) => res.status(status).type("text/plain; charset=utf-8").send(body);

  // Read limit for the plain GET routes (/health is exempt so uptime checks never get blocked).
  const readGuard = (req: Request, res: Response): boolean => {
    const lim = limiter.check(hashOf(ipOf(req)), "read");
    if (lim.ok) return true;
    res.setHeader("Retry-After", String(lim.retryAfterSec));
    text(res, `Rate limit reached (600 reads per hour). Try again in ${lim.retryAfterSec} seconds.\n`, 429);
    return false;
  };

  const baseUrl = (req: Request) => `${cfg.trustProxy ? req.header("x-forwarded-proto") ?? req.protocol : req.protocol}://${req.header("host")}`;

  app.get("/health", (_req, res) => void res.json({ ok: true }));

  app.get("/", (req, res) => {
    if (!readGuard(req, res)) return;
    text(
      res,
      `Plateop vehicle check: free facts about a used car for AI agents, from the official register, with source and date. No accounts.\n\n` +
        `MCP URL (Streamable HTTP, stateless): ${baseUrl(req)}/mcp\n` +
        `Tools: vehicle_check, model_inspection_stats\n` +
        `Countries: nl, gb, il, is, dk\n` +
        `Guide: ${baseUrl(req)}/llms.txt\n` +
        `Privacy: ${baseUrl(req)}/privacy\n`,
    );
  });

  app.get("/privacy", (req, res) => {
    if (!readGuard(req, res)) return;
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type("text/html; charset=utf-8").send(renderPrivacy());
  });

  app.get("/icon.svg", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type("image/svg+xml").sendFile(join(STATIC_DIR, "icon.svg"));
  });

  // Experimental discovery file (MCP "server card", SEP-1649 draft). Costs nothing to serve and lets crawlers find /mcp.
  app.get("/.well-known/mcp/server-card.json", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      serverInfo: { name: "plateop-check", title: "Plateop vehicle check", version: "0.1.0" },
      description: "Free facts about a used car from the official register (NL, GB, IL, IS, DK) with source and date, plus model inspection statistics.",
      transport: { type: "streamable-http", endpoint: `${baseUrl(req)}/mcp` },
      authentication: { type: "none" },
      capabilities: { tools: true, resources: true },
      documentation: `${baseUrl(req)}/llms.txt`,
    });
  });

  app.get("/llms.txt", (req, res) => {
    if (readGuard(req, res)) text(res, guide());
  });

  // Stateless MCP: a fresh server + transport per request, no session id.
  app.post("/mcp", express.json({ limit: "64kb" }), async (req: Request, res: Response) => {
    const ip = ipOf(req);
    const server = createMcpServer({
      plateop,
      limiter,
      ipHash: hashOf(ip),
      caller: { ip, authorization: req.header("authorization") || undefined },
      log,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  // Stateless mode has no server-initiated stream and no session to delete.
  const notAllowed = (_req: Request, res: Response) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST (stateless server)." }, id: null });
  };
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  const http: Server = await new Promise((resolve) => {
    const s = app.listen(cfg.port, () => resolve(s));
  });
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : cfg.port;
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        http.close(() => resolve());
        http.closeAllConnections();
      }),
  };
}
