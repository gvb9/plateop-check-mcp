import { afterEach, describe, expect, it } from "vitest";
import { boot, connect, textOf, type Rig } from "./helpers.js";

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.stop();
  rig = undefined;
});

const call = async (name: string, args: Record<string, unknown>, headers: Record<string, string> = {}) => {
  const c = await connect(rig!.base, headers);
  try {
    return await c.callTool({ name, arguments: args });
  } finally {
    await c.close();
  }
};

describe("tools", () => {
  it("lists two tools, each with title and read-only annotations", async () => {
    rig = await boot();
    const c = await connect(rig.base);
    const { tools } = await c.listTools();
    await c.close();
    expect(tools.map((t) => t.name).sort()).toEqual(["model_inspection_stats", "vehicle_check"]);
    for (const t of tools) {
      expect(t.title).toBeTruthy();
      expect(t.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: true });
      expect(t.annotations?.title).toBeTruthy();
    }
  });

  it.each([
    ["nl", "nederland.plateop.com", "€4.95"],
    ["gb", "uk.plateop.com", "£3.95"],
    ["il", "israel.plateop.com", "ILS 18.9"],
    ["is", "island.plateop.com", "ISK 820"],
    ["dk", "danmark.plateop.com", "€4.95"],
  ])("vehicle_check %s uses host %s and links to the report without the plate", async (country, host, price) => {
    rig = await boot();
    const r = await call("vehicle_check", { plate: "12-ABC-3", country });
    const t = textOf(r);
    expect(r.isError).toBeFalsy();
    expect(rig.fake.seen[0].host).toBe(host);
    expect(t).toContain("Volkswagen");
    expect(t).toContain("Source: ");
    expect(t).toContain("as of 2026-09-18");
    expect(t).toContain("This is the free part of the Plateop report");
    expect(t).toContain(price);
    const link = t.match(/https:\/\/[a-z]+\.plateop\.com\/analyse\/nieuw\b[^\s)]*/)![0];
    expect(link).toBe(`https://${host}/analyse/nieuw`);
    expect(link).not.toContain("12-ABC-3");
    expect((r.structuredContent as { kenteken: string }).kenteken).toBe("12-ABC-3");
  });

  it("shows per-country extras: recall (nl), model-level recall (dk)", async () => {
    rig = await boot();
    expect(textOf(await call("vehicle_check", { plate: "A", country: "nl" }))).toContain("Status: hersteld");
    expect(textOf(await call("vehicle_check", { plate: "A", country: "dk" }))).toContain("EU Safety Gate");
  });

  it("passes the language, IP headers and the Authorization header unchanged", async () => {
    rig = await boot({ trustProxy: true });
    await call("vehicle_check", { plate: "12-ABC-3", country: "nl", language: "en" }, { "X-Real-IP": "203.0.113.9", Authorization: "Bearer abc.def" });
    const s = rig.fake.seen[0];
    expect(s.path).toBe("/api/rapport/kenteken/12-ABC-3?taal=en");
    expect(s.realIp).toBe("203.0.113.9");
    expect(s.forwardedFor).toBe("203.0.113.9");
    expect(s.authorization).toBe("Bearer abc.def");
  });

  it("sends no Authorization header when the agent sent none", async () => {
    rig = await boot();
    await call("vehicle_check", { plate: "A", country: "nl" });
    expect(rig.fake.seen[0].authorization).toBeUndefined();
    expect(rig.fake.seen[0].realIp).toMatch(/127\.0\.0\.1|::1/);
  });

  it("encodes the plate in the path", async () => {
    rig = await boot();
    await call("vehicle_check", { plate: "AA19 AAA", country: "gb" });
    expect(rig.fake.seen[0].path).toBe("/api/rapport/kenteken/AA19%20AAA");
  });

  it("translates app errors into plain sentences", async () => {
    rig = await boot();
    const bad = await call("vehicle_check", { plate: "BAD", country: "nl" });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain("not a valid");
    expect(textOf(bad)).toContain("Plate format is not valid");
    expect(textOf(await call("vehicle_check", { plate: "NOPE", country: "nl" }))).toContain("no vehicle with this plate");
    const slow = await call("vehicle_check", { plate: "SLOW", country: "nl" });
    expect(slow.isError).toBe(true);
    expect(textOf(slow)).toContain("Try again in 37 seconds");
    expect(textOf(await call("vehicle_check", { plate: "DOWN", country: "nl" }))).toContain("temporarily switched off");
    expect(textOf(await call("vehicle_check", { plate: "SRC", country: "nl" }))).toContain("not answering");
  });

  it("rejects an unsupported country before calling Plateop", async () => {
    rig = await boot();
    const c = await connect(rig.base);
    const r = await c.callTool({ name: "vehicle_check", arguments: { plate: "A", country: "fr" } }).catch((e) => e);
    await c.close();
    expect(r instanceof Error || (r as { isError?: boolean }).isError).toBeTruthy();
    expect(rig.fake.seen).toHaveLength(0);
  });

  it("answers with a clear error when Plateop does not answer in time", async () => {
    rig = await boot({ timeoutMs: 200 });
    const r = await call("vehicle_check", { plate: "HANG", country: "nl" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("did not answer");
  });

  it("answers with a clear error when Plateop is down", async () => {
    rig = await boot({ plateopBaseUrl: "http://127.0.0.1:1" });
    const r = await call("vehicle_check", { plate: "A", country: "nl" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("could not be reached");
  });

  it("model_inspection_stats returns the model JSON with the citation line", async () => {
    rig = await boot();
    const r = await call("model_inspection_stats", { brand: "Volkswagen", model: "Golf", country: "nl" });
    const t = textOf(r);
    expect(rig.fake.seen[0].path).toBe("/open/model/volkswagen/golf.json");
    expect(t).toContain("Afkeurpercentage 12.4% (1240 of 10000)");
    expect(t).toContain("Meest voorkomend gebrek: Verlichting");
    expect(t).toContain("https://nederland.plateop.com/open/model/volkswagen/golf.json");
    expect(t).toContain("Bron: Plateop (plateop.com), Volkswagen Golf");
    expect(t).toContain("CC BY 4.0");
    expect((r.structuredContent as { canoniek: string }).canoniek).toBe("volkswagen/golf");
  });

  it("model_inspection_stats keeps only the top points per source and age band", async () => {
    rig = await boot();
    const r = await call("model_inspection_stats", { brand: "many", model: "points", country: "nl" });
    const t = textOf(r);
    expect(t).toContain("age 3-5 yr: Verlichting 20.0% (200 of 1000); Remmen 10.0% (100 of 1000); Banden 5.0% (50 of 1000)");
    expect(t).not.toContain("Ruitenwissers");
    const s = r.structuredContent as { sources: { bands: { points: unknown[] }[] }[] };
    expect(s.sources[0].bands[0].points).toHaveLength(3);
  });

  it("model_inspection_stats: unknown model and Plateop 429", async () => {
    rig = await boot();
    const unknown = await call("model_inspection_stats", { brand: "Foo", model: "Bar", country: "nl" });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain("no published inspection statistics");
    const slow = await call("model_inspection_stats", { brand: "rate", model: "limit", country: "nl" });
    expect(textOf(slow)).toContain("Try again in 60 seconds");
  });

  it("limits vehicle_check to 20 per 10 minutes per address, then says how long to wait", async () => {
    rig = await boot({ now: () => 1_800_000_000_000 });
    const c = await connect(rig.base);
    let last = "";
    for (let i = 0; i < 21; i++) last = textOf(await c.callTool({ name: "vehicle_check", arguments: { plate: "A", country: "nl" } }));
    await c.close();
    expect(last).toMatch(/Rate limit reached for vehicle_check\. Try again in \d+ seconds/);
    expect(rig.fake.seen).toHaveLength(20);
  });

  it("limits the model tool to 60 per minute", async () => {
    rig = await boot({ now: () => 1_800_000_000_000 });
    const c = await connect(rig.base);
    let last = { isError: false } as { isError?: boolean };
    for (let i = 0; i < 61; i++) last = (await c.callTool({ name: "model_inspection_stats", arguments: { brand: "volkswagen", model: "golf", country: "nl" } })) as typeof last;
    await c.close();
    expect(last.isError).toBe(true);
    expect(rig.fake.seen).toHaveLength(60);
  });

  it("logs tool, country and result but never the plate", async () => {
    rig = await boot();
    await call("vehicle_check", { plate: "12-ABC-3", country: "nl" });
    expect(rig.logs).toHaveLength(1);
    expect(rig.logs[0]).toMatch(/^tool=vehicle_check country=nl result=ok ip=[0-9a-f]{12}$/);
  });
});
