import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Config } from "../src/config.js";
import { startServer, type RunningServer } from "../src/server.js";
import { startFakePlateop, type FakePlateop } from "./fakePlateop.js";

export interface Rig {
  base: string;
  fake: FakePlateop;
  logs: string[];
  stop(): Promise<void>;
}

/** Boots the fake Plateop and the MCP service pointing at it. */
export async function boot(extra: Partial<Config> = {}): Promise<Rig> {
  const fake = await startFakePlateop();
  const logs: string[] = [];
  const server: RunningServer = await startServer(
    { port: 0, plateopBaseUrl: fake.url, trustProxy: false, timeoutMs: 10_000, ...extra },
    (l) => logs.push(l),
  );
  return {
    base: `http://127.0.0.1:${server.port}`,
    fake,
    logs,
    stop: async () => {
      await server.close();
      await fake.close();
    },
  };
}

export async function connect(base: string, headers: Record<string, string> = {}): Promise<Client> {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers } }));
  return client;
}

export const textOf = (r: unknown): string => (r as { content: { text: string }[] }).content[0].text;
