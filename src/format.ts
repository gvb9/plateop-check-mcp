import { reportUrl, type Bron, type Country, type ModelStats, type VehicleReport } from "./plateop.js";

const LABELS: Record<string, string> = {
  merk: "make", model: "model", bouwjaar: "year of manufacture", brandstof: "fuel", kleur: "colour", carrosserie: "body",
  handelsbenaming: "trade name", cilinderinhoudCc: "engine size (cc)", vermogenKw: "power (kW)", motorcode: "engine code",
  uitvoeringFabrikant: "manufacturer variant", catalogusprijs: "list price", datumEersteToelating: "first registration",
  datumLaatsteTenaamstelling: "last change of owner", co2UitstootGkm: "CO2 (g/km)", emissieklasse: "emission class",
  verbruikL100km: "fuel use (l/100 km)", jaarLaatsteTellerregistratie: "year of last odometer reading",
  datumLaatsteKeuring: "last inspection", aandrijving: "drive",
};

const src = (b: { bron: Bron; peildatum: string }) =>
  `Source: ${b.bron.naam}${b.bron.url ? ` (${b.bron.url})` : ""}, as of ${b.peildatum}.`;

function props(o: Record<string, unknown>): string {
  return Object.entries(o)
    .filter(([k]) => k !== "bron" && k !== "peildatum")
    .map(([k, v]) => `${LABELS[k] ?? k}: ${v}`)
    .join("; ");
}

const money = (amount: number, currency: string) =>
  currency === "EUR" ? `€${amount.toFixed(2)}` : currency === "GBP" ? `£${amount.toFixed(2)}` : `${currency} ${amount}`;

/** The free facts per heading, each with source and as-of date, then the fixed paid-report line. Values stay in the register's language. */
export function vehicleText(r: VehicleReport, country: Country): string {
  const out: string[] = [`Plateop vehicle check for plate ${r.kenteken} (${r.markt}). Fetched ${r.opgehaaldOp}. Values are shown as the register gives them.`, ""];
  out.push("Vehicle", props(r.voertuig), src(r.voertuig), "");
  out.push("Key facts", props(r.kernfeiten) || "none available", src(r.kernfeiten), "");
  const single = (title: string, v: (Parameters<typeof src>[0]) | null, value: string) => {
    out.push(title, v ? `${value} ${src(v)}` : "Not available for this vehicle or country.", "");
  };
  single("Next periodic inspection due", r.apkVervaldatum, r.apkVervaldatum ? `${r.apkVervaldatum.datum}.` : "");
  single(
    "Odometer verdict",
    r.tellerstandOordeel,
    r.tellerstandOordeel ? `${r.tellerstandOordeel.oordeel}${r.tellerstandOordeel.toelichtingCode ? ` (${r.tellerstandOordeel.toelichtingCode})` : ""}.` : "",
  );
  single("Insured", r.verzekering, r.verzekering ? (r.verzekering.verzekerd ? "Yes." : "No.") : "");
  out.push("Inspection findings");
  if (r.keuringen.length === 0) out.push("None recorded.");
  for (const k of r.keuringen) out.push(`- ${k.datum ?? "date unknown"}: ${k.omschrijving} (${k.soort}, ${k.aantal}x). ${src(k)}`);
  out.push("");
  single(
    "Recalls for this vehicle",
    r.terugroepVoertuig,
    r.terugroepVoertuig ? `Status: ${r.terugroepVoertuig.status}${r.terugroepVoertuig.aantalActies ? `, ${r.terugroepVoertuig.aantalActies} action(s)` : ""}.` : "",
  );
  single(
    "Recalls for this make or model (EU Safety Gate)",
    r.terugroepModelniveau,
    r.terugroepModelniveau ? `Level: ${r.terugroepModelniveau.status}, ${r.terugroepModelniveau.aantal} notice(s).` : "",
  );
  if (r.beperkingen.length) out.push("Limitations", ...r.beperkingen.map((b) => `- ${b}`), "");
  out.push(`Licence ${r.licentie}. ${r.citeerwijze}`, "");
  out.push(
    `This is the free part of the Plateop report. The full report (purchase score, advice, known model problems, price verdict) costs ${money(r.volledigRapport.prijs.bedrag, r.volledigRapport.prijs.valuta)} and is started by a person at ${reportUrl(country)} (the plate is entered there, it is not in the link).`,
  );
  return out.join("\n");
}

/** How many inspection points per source and age band the compact answer keeps. The full list (often 300 lines) stays at the JSON URL. */
const TOP_PER_BAND = 3;

export interface CompactPoint { category: string; count: number; total: number; share: number }
export interface CompactBand { ages: string; points: CompactPoint[] }
export interface CompactSource { source: string; asOf: string; bands: CompactBand[]; notes: string[] }
export interface CompactModel {
  model: string;
  canoniek: string;
  markt: string;
  generatedAt: string;
  sources: CompactSource[];
  generations: ModelStats["generaties"];
  licence: string;
  cite: string;
  modelPage: string;
  fullJsonUrl: string;
}

/**
 * The app's model JSON lists every inspection point per source and age band (hundreds of lines).
 * An agent needs the picture, not the table: per source and age band the points with the highest
 * share, plus the link to the full JSON for anyone who wants all of it.
 */
export function compactModel(m: ModelStats, country: Country): CompactModel {
  const bySource = new Map<string, CompactSource>();
  for (const f of m.feiten) {
    let s = bySource.get(f.bron);
    if (!s) {
      s = { source: f.bron, asOf: f.peildatum, bands: [], notes: [] };
      bySource.set(f.bron, s);
    }
    const category = f.kop.includes(":") ? f.kop.slice(f.kop.indexOf(":") + 1).trim() : f.kop;
    if (f.teller === undefined || f.noemer === undefined || f.noemer === 0) {
      s.notes.push(`${f.kop}${f.waarde ? `: ${f.waarde}` : ""}`);
      continue;
    }
    const ages = /leeftijd ([^,.]+?) jr/.exec(f.waarde ?? "")?.[1] ?? "all ages";
    let band = s.bands.find((b) => b.ages === ages);
    if (!band) {
      band = { ages, points: [] };
      s.bands.push(band);
    }
    band.points.push({ category, count: f.teller, total: f.noemer, share: f.teller / f.noemer });
  }
  for (const s of bySource.values()) {
    for (const b of s.bands) b.points = b.points.sort((a, z) => z.share - a.share).slice(0, TOP_PER_BAND);
  }
  const host = m.bron ? new URL(m.bron).host : `${country}.plateop.com`;
  return {
    model: m.model,
    canoniek: m.canoniek,
    markt: m.markt,
    generatedAt: m.gegenereerdOp,
    sources: [...bySource.values()],
    generations: m.generaties,
    licence: m.licentie,
    cite: m.citeer,
    modelPage: m.bron,
    fullJsonUrl: `https://${host}/open/model/${m.canoniek}.json`,
  };
}

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;

export function modelText(c: CompactModel, country: Country): string {
  const out: string[] = [`Plateop inspection statistics for ${c.model} (${c.markt}). Generated ${c.generatedAt}.`, ""];
  if (c.sources.length === 0) out.push("No statistics published for this model.");
  for (const s of c.sources) {
    out.push(`${s.source} (as of ${s.asOf})`);
    for (const b of s.bands) {
      const pts = b.points.map((p) => `${p.category} ${pct(p.share)} (${p.count} of ${p.total})`).join("; ");
      out.push(`- ${b.ages === "all ages" ? "all ages" : `age ${b.ages} yr`}: ${pts}`);
    }
    for (const n of s.notes) out.push(`- ${n}`);
    out.push("");
  }
  out.push(`Shown: the ${TOP_PER_BAND} most frequent inspection points per source and age band. Every point: ${c.fullJsonUrl}`);
  if (c.generations.length) {
    out.push("", "Generations");
    for (const g of c.generations) out.push(`- ${g.slug}: ${g.bouwjaren.van ?? "?"} to ${g.bouwjaren.tot ?? "present"}. ${g.url}`);
  }
  out.push("", `Licence ${c.licence}. Cite as: ${c.cite}`, `Model page: ${c.modelPage}`);
  out.push("", `For one specific car, use vehicle_check; its full report is started at ${reportUrl(country)}.`);
  return out.join("\n");
}
