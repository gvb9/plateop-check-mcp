import type { Config } from "./config.js";

/** Country code (the tool argument) to the Plateop land host. Source: Plateop src/lib/hosts.ts. */
export const COUNTRIES = {
  nl: "nederland",
  gb: "uk",
  il: "israel",
  is: "island",
  dk: "danmark",
} as const;
export type Country = keyof typeof COUNTRIES;
export const COUNTRY_CODES = Object.keys(COUNTRIES) as [Country, ...Country[]];

export const hostName = (c: Country) => `${COUNTRIES[c]}.plateop.com`;
/** The page where a human starts a full report. No plate in the URL on purpose (a plate in a URL identifies a vehicle). */
export const reportUrl = (c: Country) => `https://${hostName(c)}/analyse/nieuw`;

// Shapes from Plateop src/server/api-publiek/schema.ts and src/server/open-data/model-json.ts.
export interface Bron { naam: string; url: string | null }
export interface Sourced { bron: Bron; peildatum: string }
export interface VehicleReport {
  kenteken: string;
  markt: string;
  taal: string;
  opgehaaldOp: string;
  voertuig: Sourced & Record<string, string | number | Bron | undefined>;
  kernfeiten: Sourced & Record<string, string | number | Bron | undefined>;
  apkVervaldatum: (Sourced & { datum: string }) | null;
  tellerstandOordeel: (Sourced & { oordeel: string; toelichtingCode?: string }) | null;
  verzekering: (Sourced & { verzekerd: boolean }) | null;
  keuringen: (Sourced & { datum: string | null; omschrijving: string; soort: string; aantal: number })[];
  terugroepVoertuig: (Sourced & { status: string; aantalActies?: number }) | null;
  terugroepModelniveau: (Sourced & { status: string; aantal: number }) | null;
  beperkingen: string[];
  volledigRapport: { url: string; prijs: { bedrag: number; valuta: string } };
  licentie: string;
  citeerwijze: string;
}
export interface ModelStats {
  model: string;
  canoniek: string;
  markt: string;
  taal: string;
  peildata: { naam: string; peildatum: string }[];
  feiten: { kop: string; waarde?: string; teller?: number; noemer?: number; bron: string; peildatum: string }[];
  generaties: { slug: string; bouwjaren: { van: number | null; tot: number | null }; url: string }[];
  licentie: string;
  citeer: string;
  bron: string;
  gegenereerdOp: string;
}

export type Fetched<T> = { ok: true; data: T } | { ok: false; message: string };

/** What the Plateop app needs to see about the agent behind this call. */
export interface Caller {
  ip: string;
  /** The agent's own Authorization header, passed on unchanged (a paid tier can use it later without a change here). */
  authorization?: string;
}

/** Lowercase ascii slug as the Plateop model URLs use it ("Mercedes-Benz" becomes "mercedes-benz"). */
export function slugify(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface ErrorBody { fout?: string; bericht?: string }

function describeError(status: number, body: ErrorBody | null, retryAfter: string | null, what: string): string {
  const detail = body?.bericht ? ` Plateop says: ${body.bericht}` : "";
  const code = body?.fout;
  if (status === 429) {
    const wait = retryAfter && /^\d+$/.test(retryAfter) ? ` Try again in ${retryAfter} seconds.` : " Try again later.";
    return `Plateop's own rate limit for this address has been reached.${wait}`;
  }
  if (status === 400) return `That is not a valid ${what}.${detail || " Check the format for the chosen country."}`;
  if (status === 404 && code === "kenteken_niet_gevonden") return `The register has no vehicle with this plate.${detail}`;
  if (status === 404 && (code === "model_niet_gevonden" || code === "model_niet_gepubliceerd")) {
    return "Plateop has no published inspection statistics for this brand and model in this country. Check the spelling, or try the common name (for example brand 'volkswagen', model 'golf').";
  }
  if (status === 404) return `Plateop does not offer this for the chosen country (${code ?? "not found"}).${detail}`;
  if (status === 502) return `The official source behind Plateop (the national vehicle register) is not answering right now. Try again in a few minutes.${detail}`;
  if (status === 503) return `Plateop has temporarily switched off this free lookup for the chosen country. Try again later.${detail}`;
  return `Plateop answered with an unexpected error (HTTP ${status}${code ? `, ${code}` : ""}).${detail}`;
}

export class PlateopClient {
  constructor(private cfg: Pick<Config, "plateopBaseUrl" | "timeoutMs">) {}

  vehicle(country: Country, plate: string, language: string | undefined, caller: Caller): Promise<Fetched<VehicleReport>> {
    const q = language ? `?taal=${encodeURIComponent(language)}` : "";
    return this.get<VehicleReport>(`/api/rapport/kenteken/${encodeURIComponent(plate)}${q}`, country, caller, "plate for this country");
  }

  model(country: Country, brand: string, model: string, language: string | undefined, caller: Caller): Promise<Fetched<ModelStats>> {
    const q = language ? `?taal=${encodeURIComponent(language)}` : "";
    const path = `/open/model/${encodeURIComponent(slugify(brand))}/${encodeURIComponent(slugify(model))}.json${q}`;
    return this.get<ModelStats>(path, country, caller, "brand or model");
  }

  private async get<T>(path: string, country: Country, caller: Caller, what: string): Promise<Fetched<T>> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "x-forwarded-host": hostName(country),
      "x-forwarded-for": caller.ip,
      "x-real-ip": caller.ip,
    };
    if (caller.authorization) headers.authorization = caller.authorization;
    let res: Response;
    try {
      res = await fetch(this.cfg.plateopBaseUrl + path, { headers, signal: AbortSignal.timeout(this.cfg.timeoutMs) });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      return { ok: false, message: timedOut ? "Plateop did not answer within 10 seconds. Try again shortly." : "Plateop could not be reached. Try again shortly." };
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON: handled below */
    }
    if (!res.ok) {
      return { ok: false, message: describeError(res.status, body as ErrorBody | null, res.headers.get("retry-after"), what) };
    }
    if (!body || typeof body !== "object") return { ok: false, message: "Plateop sent an answer that is not JSON." };
    return { ok: true, data: body as T };
  }
}
