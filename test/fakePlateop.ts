import express from "express";
import type { Server } from "node:http";

const MARKETS: Record<string, { markt: string; taal: string; bedrag: number; valuta: string; bron: string }> = {
  "nederland.plateop.com": { markt: "nl", taal: "nl", bedrag: 4.95, valuta: "EUR", bron: "Kentekenregister" },
  "uk.plateop.com": { markt: "gb", taal: "en", bedrag: 3.95, valuta: "GBP", bron: "DVSA" },
  "israel.plateop.com": { markt: "il", taal: "he", bedrag: 18.9, valuta: "ILS", bron: "data.gov.il" },
  "island.plateop.com": { markt: "is", taal: "is", bedrag: 820, valuta: "ISK", bron: "Samgöngustofa (island.is)" },
  "danmark.plateop.com": { markt: "dk", taal: "da", bedrag: 4.95, valuta: "EUR", bron: "Motorregistret" },
};

export interface SeenRequest {
  path: string;
  host?: string;
  forwardedFor?: string;
  realIp?: string;
  authorization?: string;
}

export interface FakePlateop {
  url: string;
  seen: SeenRequest[];
  close(): Promise<void>;
}

/** A stand-in for the Plateop app. Answers match schema.ts (RapportKentekenResponseSchema) and model-json.ts. Special plates trigger errors. */
export async function startFakePlateop(): Promise<FakePlateop> {
  const seen: SeenRequest[] = [];
  const app = express();
  app.use((req, _res, next) => {
    seen.push({
      path: req.originalUrl,
      host: req.header("host"),
      forwardedFor: req.header("x-forwarded-for"),
      realIp: req.header("x-real-ip"),
      authorization: req.header("authorization"),
    });
    next();
  });

  const err = (res: express.Response, status: number, fout: string, bericht?: string, extra: Record<string, string> = {}) =>
    res.status(status).set(extra).json(bericht ? { fout, bericht } : { fout });

  app.get("/api/rapport/kenteken/:plate", (req, res) => {
    const m = MARKETS[req.header("host") ?? ""];
    if (!m) return void err(res, 404, "onbekende_host", "Unknown host.");
    const plate = req.params.plate;
    if (plate === "BAD") return void err(res, 400, "ongeldig_kenteken", "Plate format is not valid for this market.");
    if (plate === "NOPE") return void err(res, 404, "kenteken_niet_gevonden", "No such plate in the register.");
    if (plate === "SLOW") return void err(res, 429, "te_veel_verzoeken", "Too many requests.", { "Retry-After": "37" });
    if (plate === "DOWN") return void err(res, 503, "tijdelijk_uitgeschakeld", "Switched off by the operator.");
    if (plate === "SRC") return void err(res, 502, "bron_niet_beschikbaar", "Source failed.");
    if (plate === "HANG") return; // never answers: exercises the timeout
    const bron = { naam: m.bron, url: null };
    const peildatum = "2026-09-18";
    const taal = typeof req.query.taal === "string" ? req.query.taal : m.taal;
    res.json({
      kenteken: plate,
      markt: m.markt,
      taal,
      opgehaaldOp: "2026-09-18T10:00:00.000Z",
      voertuig: { merk: "Volkswagen", model: "Golf", bouwjaar: 2016, brandstof: "Benzine", bron, peildatum },
      kernfeiten: { catalogusprijs: 25000, vermogenKw: 85, bron, peildatum },
      apkVervaldatum: { datum: "2027-03-01", bron, peildatum },
      tellerstandOordeel: { oordeel: "Logisch", bron, peildatum },
      verzekering: { verzekerd: true, bron, peildatum },
      keuringen: [{ datum: "2025-03-01", omschrijving: "Remvloeistof verontreinigd", soort: "gebrek", aantal: 1, bron, peildatum }],
      terugroepVoertuig: m.markt === "nl" ? { status: "hersteld", bron, peildatum } : null,
      terugroepModelniveau: m.markt === "dk" ? { status: "model", aantal: 2, bron: { naam: "EU Safety Gate", url: "https://ec.europa.eu/safety-gate" }, peildatum } : null,
      beperkingen: [],
      volledigRapport: {
        url: `https://${req.header("host")}/analyse/nieuw/voorproef?vehicleId=abc123`,
        prijs: { bedrag: m.bedrag, valuta: m.valuta },
      },
      licentie: "CC BY 4.0",
      citeerwijze: `Bron: Plateop (plateop.com), kenteken ${plate}. Vermeld de bron en de peildatum bij hergebruik.`,
    });
  });

  app.get("/open/model/:merk/:model", (req, res) => {
    const m = MARKETS[req.header("host") ?? ""];
    if (!m) return void err(res, 404, "onbekende_host");
    if (req.params.merk === "rate") return void err(res, 429, "te_veel_verzoeken", undefined, { "Retry-After": "60" });
    if (req.params.merk !== "volkswagen" || req.params.model !== "golf.json") return void err(res, 404, "model_niet_gevonden");
    res.json({
      model: "Volkswagen Golf",
      canoniek: "volkswagen/golf",
      markt: m.markt,
      taal: m.taal,
      peildata: [{ naam: "APK-statistiek", peildatum: "2026-09-01" }],
      feiten: [
        { kop: "Afkeurpercentage", waarde: "12,4%", teller: 1240, noemer: 10000, bron: "APK-statistiek", peildatum: "2026-09-01" },
        { kop: "Meest voorkomend gebrek", waarde: "Verlichting", bron: "APK-statistiek", peildatum: "2026-09-01" },
      ],
      generaties: [{ slug: "golf-7", bouwjaren: { van: 2012, tot: 2019 }, url: "https://nederland.plateop.com/modellen/volkswagen/golf/golf-7" }],
      licentie: "CC BY 4.0",
      citeer: "Bron: Plateop (plateop.com), Volkswagen Golf, Nederland, september 2026.",
      bron: "https://nederland.plateop.com/modellen/volkswagen/golf",
      gegenereerdOp: "2026-09-18T00:00:00.000Z",
    });
  });

  const http: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        http.close(() => resolve());
        http.closeAllConnections();
      }),
  };
}
