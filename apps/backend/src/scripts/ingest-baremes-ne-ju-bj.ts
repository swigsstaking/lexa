#!/usr/bin/env node
/**
 * ingest-baremes-ne-ju-bj — Ingère les barèmes PP 2026 NE / JU / BJ dans Qdrant.
 *
 * Exécution (depuis apps/backend/) :
 *   npx tsx src/scripts/ingest-baremes-ne-ju-bj.ts
 *   QDRANT_URL=http://192.168.110.103:6333 EMBEDDER_URL=http://192.168.110.103:8082 npx tsx src/scripts/ingest-baremes-ne-ju-bj.ts
 *
 * Stratégie :
 *   - Supprime d'abord les points existants par law (idempotent)
 *   - 2-3 points par canton : barème PP, déductions, coefficients
 *   - Payload canonique QdrantHit-compatible (law, rs, topic, etc.)
 *   - Embedde via BGE-M3 (EMBEDDER_URL)
 *
 * Sources :
 *   - NE : LCdir RSN 631.0 (SCCO NE) — coefficient canton 111% + commune ~65%
 *   - JU : LI-JU RSJU 641.11 (SCCJ) — coefficient cantonal 240%
 *   - BJ : LIMP-BE RSB 661.11 (ADB) — coefficient cantonal 304%
 */

import axios from "axios";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const QDRANT_URL = process.env.QDRANT_URL ?? "http://192.168.110.103:6333";
const EMBEDDER_URL = process.env.EMBEDDER_URL ?? "http://192.168.110.103:8082";
const COLLECTION = process.env.QDRANT_COLLECTION ?? "swiss_law";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BaremePoint {
  law: string;
  rs: string;
  topic: string[];
  canton: string;
  year: number;
  heading: string;
  text: string;
}

interface QdrantPayload {
  text: string;
  law: string;
  law_label: string;
  article: string;
  article_num: string;
  heading: string;
  rs: string;
  topic: string;
  category: string;
  canton: string;
  year: number;
  date_version: string;
  source: string;
  jurisdiction: string;
  confidence: string;
}

// ---------------------------------------------------------------------------
// Points à ingérer — 3 points par canton (barème, déductions, coefficients)
// ---------------------------------------------------------------------------

const POINTS: BaremePoint[] = [
  // ── NEUCHÂTEL (NE) ────────────────────────────────────────────────────────
  {
    law: "Bareme-NE-PP-2026",
    rs: "RSN 631.0",
    topic: ["bareme", "icc", "pp", "ne", "lcdir"],
    canton: "NE",
    year: 2026,
    heading: "Barème ICC PP Neuchâtel 2026 — LCdir Art. 40",
    text: [
      "Barème impôt cantonal et communal (ICC) personnes physiques (PP) Neuchâtel 2026.",
      "Source : Loi sur les contributions directes LCdir RSN 631.0, Art. 40.",
      "Autorité : SCCO NE (Service cantonal des contributions et de l'organisation).",
      "Tarif de base progressif : 1.5% → 12.5% du revenu imposable.",
      "Coefficient cantonal 2026 : 111% de l'impôt de base.",
      "Coefficient communal moyen : ~65% (variable selon commune).",
      "Taux effectif global estimé : ~1.76× le taux de base (canton + commune moyen).",
      "Impôt minimum cantonal : CHF 25.",
      "Taux effectif ICC pour revenu CHF 80'000 : ~13-16% (canton + commune).",
      "Taux effectif ICC pour revenu CHF 150'000 : ~17-20%.",
      "Estimation indicative — confirmer avec SCCO NE ou fiduciaire.",
    ].join(" "),
  },
  {
    law: "Bareme-NE-PP-2026",
    rs: "RSN 631.0",
    topic: ["deductions", "icc", "pp", "ne", "lcdir"],
    canton: "NE",
    year: 2026,
    heading: "Déductions sociales PP Neuchâtel 2026 — LCdir RSN 631.0",
    text: [
      "Déductions sociales impôt cantonal PP Neuchâtel 2026.",
      "Source : LCdir RSN 631.0 — SCCO NE.",
      "Déduction personne seule : CHF 12'800.",
      "Déduction couple marié : CHF 25'600.",
      "Déduction par enfant à charge : CHF 6'200.",
      "Pilier 3a salarié avec LPP : CHF 7'260 (max fédéral 2026).",
      "Pilier 3a salarié sans LPP : CHF 36'288 (max fédéral 2026).",
      "Forfait frais professionnels : 3% du salaire brut, min CHF 1'700, max CHF 3'400.",
      "Délai de dépôt déclaration NE : 31 mars (prolongeable sur demande).",
      "Estimation indicative — confirmer avec SCCO NE ou fiduciaire.",
    ].join(" "),
  },
  {
    law: "Bareme-NE-PP-2026",
    rs: "RSN 631.0",
    topic: ["coefficients", "icc", "pp", "ne", "communes"],
    canton: "NE",
    year: 2026,
    heading: "Coefficients cantonaux et communaux NE 2026",
    text: [
      "Coefficients impôt cantonal et communal Neuchâtel 2026.",
      "Coefficient cantonal fixe 2026 : 111% de l'impôt de base LCdir.",
      "Coefficient communal : variable selon commune, fourchette ~50-80%.",
      "Exemples communes NE : Neuchâtel ~68%, La Chaux-de-Fonds ~65%, Le Locle ~70%.",
      "Coefficient global moyen estimé : ~176% (canton 111% + commune ~65%).",
      "Structure ICC NE : impôt de base × coefficient cantonal + impôt de base × coefficient communal.",
      "Les communes peuvent fixer leur coefficient annuellement.",
      "Taux effectif ICC NE parmi les plus élevés de Suisse romande.",
      "Source : SCCO NE — www.ne.ch/autorites/DDF/SCCO.",
      "Estimation indicative — confirmer avec commune ou SCCO NE.",
    ].join(" "),
  },

  // ── JURA (JU) ────────────────────────────────────────────────────────────
  {
    law: "Bareme-JU-PP-2026",
    rs: "RSJU 641.11",
    topic: ["bareme", "icc", "pp", "ju", "li-ju"],
    canton: "JU",
    year: 2026,
    heading: "Barème ICC PP Jura 2026 — LI-JU Art. 40",
    text: [
      "Barème impôt cantonal et communal (ICC) personnes physiques (PP) Jura 2026.",
      "Source : Loi d'impôt du canton du Jura LI-JU RSJU 641.11, Art. 40.",
      "Autorité : SCCJ (Service cantonal des contributions du Jura).",
      "Tarif de base progressif : 1% → 13% du revenu imposable.",
      "Coefficient cantonal 2026 : 240% du barème de base.",
      "Taux effectif global estimé : ~33.8% du revenu imposable pour revenus moyens-hauts.",
      "Impôt minimum cantonal : CHF 20.",
      "Taux effectif ICC pour revenu CHF 80'000 : ~11-14% (canton inclus commune).",
      "Note : Moutier intégrée au canton du Jura depuis le 1er janvier 2021.",
      "Le coefficient 240% intègre canton + impôt communal moyen JU.",
      "Estimation indicative — confirmer avec SCCJ ou fiduciaire.",
    ].join(" "),
  },
  {
    law: "Bareme-JU-PP-2026",
    rs: "RSJU 641.11",
    topic: ["deductions", "icc", "pp", "ju", "li-ju"],
    canton: "JU",
    year: 2026,
    heading: "Déductions sociales PP Jura 2026 — LI-JU RSJU 641.11",
    text: [
      "Déductions sociales impôt cantonal PP Jura 2026.",
      "Source : LI-JU RSJU 641.11 — SCCJ.",
      "Déduction personne seule : CHF 11'200.",
      "Déduction couple marié : CHF 22'400.",
      "Déduction par enfant à charge : CHF 5'100.",
      "Pilier 3a salarié avec LPP : CHF 7'260 (max fédéral 2026).",
      "Pilier 3a salarié sans LPP : CHF 36'288 (max fédéral 2026).",
      "Forfait frais professionnels : 3% du salaire brut, min CHF 1'700, max CHF 3'400.",
      "Délai de dépôt déclaration JU : 31 mars (prolongeable sur demande).",
      "Estimation indicative — confirmer avec SCCJ ou fiduciaire.",
    ].join(" "),
  },
  {
    law: "Bareme-JU-PP-2026",
    rs: "RSJU 641.11",
    topic: ["coefficients", "icc", "pp", "ju", "moutier"],
    canton: "JU",
    year: 2026,
    heading: "Coefficient cantonal Jura 240% — ICC PP 2026",
    text: [
      "Coefficient cantonal Jura 2026 : 240% du barème de base LI-JU.",
      "Le coefficient 240% est fixé annuellement par le Parlement jurassien.",
      "Ce coefficient intègre à la fois la part cantonale et la part communale moyenne.",
      "Les communes jurassiennes ne perçoivent pas de coefficient séparé en plus du 240%.",
      "Comparatif : NE 111%+commune, JU 240% global, FR ~100% direct, BE/BJ 304%.",
      "Taux effectif ICC JU estimé : ~33.8% pour revenus imposables > CHF 130'000.",
      "JU est dans la fourchette moyenne-haute des cantons romands pour la charge fiscale PP.",
      "Source : SCCJ — www.jura.ch/DFI/SCC.",
      "Estimation indicative — confirmer avec SCCJ ou fiduciaire.",
    ].join(" "),
  },

  // ── JURA BERNOIS (BJ) ─────────────────────────────────────────────────────
  {
    law: "Bareme-BJ-PP-2026",
    rs: "RSB 661.11",
    topic: ["bareme", "icc", "pp", "bj", "limp-be", "jura-bernois"],
    canton: "BJ",
    year: 2026,
    heading: "Barème ICC PP Jura bernois 2026 — LIMP-BE Art. 42",
    text: [
      "Barème impôt cantonal et communal (ICC) personnes physiques (PP) Jura bernois 2026.",
      "BJ = communes francophones du canton de Berne (Jura bernois historique + Biel/Bienne).",
      "Source : Loi sur les impôts du canton de Berne LIMP-BE RSB 661.11, Art. 42.",
      "Autorité : ADB section francophone (Administration fiscale du canton de Berne).",
      "Tarif de base progressif : 1% → 13.2% du revenu imposable.",
      "Coefficient cantonal BE 2026 : 304% du barème de base (fixe pour tout le canton).",
      "Impôt minimum cantonal : CHF 35.",
      "Taux effectif ICC pour revenu CHF 80'000 : ~14-17% (canton BE).",
      "Taux global ICC BE estimé : ~34.2% pour revenus moyens-hauts.",
      "Les communes bernoises perçoivent leurs propres centimes additionnels.",
      "Estimation indicative — confirmer avec ADB ou fiduciaire.",
    ].join(" "),
  },
  {
    law: "Bareme-BJ-PP-2026",
    rs: "RSB 661.11",
    topic: ["deductions", "icc", "pp", "bj", "limp-be"],
    canton: "BJ",
    year: 2026,
    heading: "Déductions sociales PP Jura bernois 2026 — LIMP-BE RSB 661.11",
    text: [
      "Déductions sociales impôt cantonal PP Jura bernois (canton de Berne) 2026.",
      "Source : LIMP-BE RSB 661.11 — ADB section francophone.",
      "Déduction personne seule : CHF 15'000.",
      "Déduction couple marié : CHF 30'000.",
      "Déduction par enfant à charge : CHF 6'800.",
      "Pilier 3a salarié avec LPP : CHF 7'260 (max fédéral 2026).",
      "Pilier 3a salarié sans LPP : CHF 36'288 (max fédéral 2026).",
      "Forfait frais professionnels : 3% du salaire brut, min CHF 1'700, max CHF 3'400.",
      "Délai de dépôt déclaration BE/BJ : 31 mars (prolongeable sur demande).",
      "Estimation indicative — confirmer avec ADB ou fiduciaire.",
    ].join(" "),
  },
  {
    law: "Bareme-BJ-PP-2026",
    rs: "RSB 661.11",
    topic: ["coefficients", "icc", "pp", "bj", "be", "jura-bernois"],
    canton: "BJ",
    year: 2026,
    heading: "Coefficient cantonal BE 304% — ICC PP 2026",
    text: [
      "Coefficient cantonal Berne 2026 : 304% du barème de base LIMP-BE.",
      "Le coefficient 304% est fixé annuellement par le Grand Conseil bernois.",
      "Ce coefficient est identique pour toutes les communes du canton de Berne.",
      "En plus du coefficient cantonal, les communes bernoises fixent leur propre coefficient communal.",
      "Coefficient communal moyen dans le Jura bernois : ~80-100% (variable selon commune).",
      "Exemples : Tavannes ~95%, Moutier (maintenant JU depuis 2021), Courtelary ~90%.",
      "Comparatif : NE ~176% global, JU 240% global, BE cantonal 304% + communal séparé.",
      "BE est parmi les cantons avec les charges fiscales les plus élevées de Suisse.",
      "Source : ADB — www.taxinfo.sv.fin.be.ch.",
      "Estimation indicative — confirmer avec ADB ou fiduciaire.",
    ].join(" "),
  },
];

// ---------------------------------------------------------------------------
// Helpers Qdrant
// ---------------------------------------------------------------------------

function buildPayload(point: BaremePoint, idx: number): QdrantPayload {
  return {
    text: point.text,
    law: point.law,
    law_label: `Barème PP 2026 — ${point.canton}`,
    article: point.heading,
    article_num: `${point.canton}-PP-2026-${idx}`,
    heading: point.heading,
    rs: point.rs,
    topic: point.topic.join(","),
    category: "bareme_pp",
    canton: point.canton,
    year: point.year,
    date_version: "2026-04-20",
    source: "lexa-s37",
    jurisdiction: point.canton.toLowerCase(),
    confidence: "medium",
  };
}

async function deleteExisting(law: string): Promise<void> {
  try {
    await axios.post(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
      filter: {
        must: [{ key: "law", match: { value: law } }],
      },
    });
    console.log(`[baremes] Points ${law} supprimés (idempotent)`);
  } catch (err) {
    console.warn(`[baremes] Delete ${law} skipped:`, (err as Error).message);
  }
}

async function countPoints(): Promise<number> {
  const { data } = await axios.get<{ result: { points_count: number } }>(
    `${QDRANT_URL}/collections/${COLLECTION}`,
  );
  return data.result.points_count;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const { data: embedResponse } = await axios.post<{
    data: Array<{ index: number; embedding: number[] }>;
  }>(`${EMBEDDER_URL}/v1/embeddings`, { input: texts });

  return embedResponse.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

async function upsertPoints(payloads: QdrantPayload[], vectors: number[][]): Promise<void> {
  const points = payloads.map((payload, i) => ({
    id: randomUUID(),
    vector: vectors[i],
    payload,
  }));

  await axios.put(`${QDRANT_URL}/collections/${COLLECTION}/points`, { points });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[baremes-ne-ju-bj] QDRANT   : ${QDRANT_URL}`);
  console.log(`[baremes-ne-ju-bj] EMBEDDER : ${EMBEDDER_URL}`);
  console.log(`[baremes-ne-ju-bj] COLLECTION: ${COLLECTION}`);
  console.log(`[baremes-ne-ju-bj] Points à ingérer: ${POINTS.length}`);

  // 1. Delete existing (idempotent)
  const laws = [...new Set(POINTS.map((p) => p.law))];
  for (const law of laws) {
    await deleteExisting(law);
  }

  // 2. Build payloads
  const payloads = POINTS.map((p, i) => buildPayload(p, i));
  const texts = payloads.map((p) => p.text);

  // 3. Embed
  console.log("[baremes-ne-ju-bj] Embedding via BGE-M3...");
  const t0 = Date.now();
  const vectors = await embedTexts(texts);
  console.log(
    `[baremes-ne-ju-bj] ${vectors.length} vecteurs produits en ${Date.now() - t0}ms (dim=${vectors[0]?.length ?? "?"})`,
  );

  // 4. Upsert
  const before = await countPoints();
  console.log(`[baremes-ne-ju-bj] Points avant: ${before}`);
  await upsertPoints(payloads, vectors);
  const after = await countPoints();
  console.log(`[baremes-ne-ju-bj] Points après: ${after} (+${after - before})`);

  // 5. Smoke test
  console.log("\n[baremes-ne-ju-bj] === Smoke test RAG ===");
  const testQueries = [
    "barème impôt Neuchâtel PP 2026",
    "coefficient cantonal Jura ICC",
    "déductions sociales Jura bernois",
    "taux effectif impôt BJ BE PP",
    "SCCO NE LCdir barème progressif",
  ];

  for (const q of testQueries) {
    const qVecs = await embedTexts([q]);
    const qVec = qVecs[0] ?? [];

    const { data: searchRes } = await axios.post<{
      result: Array<{ id: string; score: number; payload: QdrantPayload }>;
    }>(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
      vector: qVec,
      limit: 3,
      with_payload: true,
    });

    console.log(`\n  Q: "${q}"`);
    for (const hit of searchRes.result) {
      const isNew = ["Bareme-NE-PP-2026", "Bareme-JU-PP-2026", "Bareme-BJ-PP-2026"].includes(hit.payload.law);
      const mark = isNew ? "[NE/JU/BJ]" : "          ";
      console.log(
        `    ${mark} [${hit.score.toFixed(3)}] ${hit.payload.law} — ${(hit.payload.heading ?? hit.payload.text ?? "").slice(0, 60)}`,
      );
    }
  }

  console.log("\n[baremes-ne-ju-bj] DONE");
}

main().catch((err: unknown) => {
  console.error("[baremes-ne-ju-bj] FATAL:", err);
  process.exit(1);
});
