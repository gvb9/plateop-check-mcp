import { afterEach, describe, expect, it } from "vitest";
import { boot, type Rig } from "./helpers.js";

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.stop();
  rig = undefined;
});

describe("http", () => {
  it("GET /health", async () => {
    rig = await boot();
    expect(await (await fetch(`${rig.base}/health`)).json()).toEqual({ ok: true });
  });

  it("GET / and /llms.txt are text/plain and name the tools", async () => {
    rig = await boot();
    const r = await fetch(`${rig.base}/`);
    expect(r.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(await r.text()).toContain("vehicle_check");
    const g = await fetch(`${rig.base}/llms.txt`);
    const t = await g.text();
    for (const s of ["vehicle_check", "model_inspection_stats", "CC BY 4.0", "20 per 10 minutes", "/analyse/nieuw", "nl (Netherlands)"]) expect(t).toContain(s);
  });

  it("GET /privacy is HTML with the keeper and the Plateop privacy link", async () => {
    rig = await boot();
    const r = await fetch(`${rig.base}/privacy`);
    expect(r.headers.get("content-type")).toMatch(/^text\/html/);
    const t = await r.text();
    expect(t).toContain("Jon Mase");
    expect(t).toContain("<!--email_off-->");
    expect(t).toContain("jon@plateop.com");
    expect(t).toContain("plateop.com/privacy");
  });

  it("serves the icon and the server card", async () => {
    rig = await boot();
    const icon = await fetch(`${rig.base}/icon.svg`);
    expect(icon.headers.get("content-type")).toMatch(/svg/);
    const card = (await (await fetch(`${rig.base}/.well-known/mcp/server-card.json`)).json()) as { serverInfo: { name: string }; transport: { endpoint: string } };
    expect(card.serverInfo.name).toBe("plateop-check");
    expect(card.transport.endpoint).toBe(`${rig.base}/mcp`);
  });

  it("A2A agent card on both file names, skills equal to the MCP tools, honest about MCP", async () => {
    rig = await boot();
    const a = (await (await fetch(`${rig.base}/.well-known/agent.json`)).json()) as { url: string; description: string; skills: { id: string }[] };
    const b = (await (await fetch(`${rig.base}/.well-known/agent-card.json`)).json()) as { url: string };
    expect(a.url).toBe(`${rig.base}/mcp`);
    expect(b.url).toBe(a.url);
    expect(a.description).toContain("not an A2A message/send endpoint");
    expect(a.skills.map((s) => s.id).sort()).toEqual(["model_inspection_stats", "vehicle_check"]);
  });

  it("GET /mcp is 405 with Allow: POST", async () => {
    rig = await boot();
    const r = await fetch(`${rig.base}/mcp`);
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("POST");
  });

  it("returns 429 with Retry-After after 600 reads, but /health stays open", async () => {
    rig = await boot();
    let last = 200;
    for (let i = 0; i < 601; i++) last = (await fetch(`${rig.base}/llms.txt`)).status;
    expect(last).toBe(429);
    expect((await fetch(`${rig.base}/llms.txt`)).headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await fetch(`${rig.base}/health`)).status).toBe(200);
  });
});
