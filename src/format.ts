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

export function modelText(m: ModelStats, country: Country): string {
  const out: string[] = [`Plateop inspection statistics for ${m.model} (${m.markt}). Generated ${m.gegenereerdOp}.`, ""];
  if (m.feiten.length === 0) out.push("No statistics published for this model.");
  for (const f of m.feiten) {
    const ratio = f.teller !== undefined && f.noemer !== undefined ? ` (${f.teller} of ${f.noemer})` : "";
    out.push(`- ${f.kop}${f.waarde ? `: ${f.waarde}` : ""}${ratio}. Source: ${f.bron}, as of ${f.peildatum}.`);
  }
  if (m.generaties.length) {
    out.push("", "Generations");
    for (const g of m.generaties) out.push(`- ${g.slug}: ${g.bouwjaren.van ?? "?"} to ${g.bouwjaren.tot ?? "present"}. ${g.url}`);
  }
  out.push("", `Licence ${m.licentie}. Cite as: ${m.citeer}`, `Model page: ${m.bron}`);
  out.push("", `For one specific car, use vehicle_check; its full report is started at ${reportUrl(country)}.`);
  return out.join("\n");
}
