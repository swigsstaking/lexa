#!/usr/bin/env node
/**
 * ingest-baremes-pm-ne-ju-bj — Ingère les barèmes PM 2026 NE / JU / BJ dans Qdrant.
 *
 * Exécution (depuis apps/backend/) :
 *   npx tsx src/scripts/ingest-baremes-pm-ne-ju-bj.ts
 *   QDRANT_URL=http://192.168.110.103:6333 EMBEDDER_URL=http://192.168.110.103:8082 npx tsx src/scripts/ingest-baremes-pm-ne-ju-bj.ts
 *
 * Stratégie :
 *   - Supprime d'abord les points existants par law (idempotent)
 *   - 3 points par canton : tarif ICC PM, déductions/exonérations PM, coefficients PM
 *   - Payload canonique QdrantHit-compatible (law, rs, topic, etc.)
 *   - Embedde via BGE-M3 (EMBEDDER_URL port 8082)
 *
 * Sources :
 *   - NE : LCdir RSN 631.0 (SCCO NE) — ICC PM 16.5% bénéfice, 0.45‰ capital
 *   - JU : LI-JU RSJU 641.11 (SCCJ) — ICC PM 15.5% bénéfice, 0.50‰ capital
 *   - BJ : LIMP-BE RSB 661.11 (ADB) — ICC PM 18.6% bénéfice, 0.30‰ capital
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
// Points à ingérer — 3 points par canton (tarif, déductions, coefficient)
// ---------------------------------------------------------------------------

const POINTS: BaremePoint[] = [
  // ── NEUCHÂTEL (NE) ────────────────────────────────────────────────────────
  {
    law: "Bareme-NE-PM-2026",
    rs: "RSN 631.0",
    topic: ["bareme", "icc", "pm", "ne", "lcdir", "benefice", "capital"],
    canton: "NE",
    year: 2026,
    heading: "Barème ICC PM Neuchâtel 2026 — LCdir RSN 631.0",
    text: [
      "Barème impôt cantonal et communal (ICC) personnes morales (PM) Neuchâtel 2026.",
      "Source : Loi sur les contributions directes LCdir RSN 631.0.",
      "Autorité : SCCO NE (Service cantonal des contributions et de l'organisation).",
      "Taux ICC PM bénéfice : 16.5% du bénéfice net imposable (canton + commune inclus).",
      "Taux ICC PM capital : 0.45‰ des fonds propres imposables.",
      "IFD fédéral PM : 8.5% flat (art. 68 LIFD RS 642.11) — s'ajoute à l'ICC.",
      "Taux effectif estimé bénéfice (ICC + IFD) : ~25% pour une SA/Sàrl standard NE.",
      "Impôt minimum cantonal PM : CHF 100 (fixe, indépendant du bénéfice).",
      "Exonération PM : associations et fondations d'utilité publique exonérées si bénéfice < CHF 20'000.",
      "NE est parmi les cantons romands avec une charge fiscale PM modérée à moyenne.",
      "Estimation indicative — confirmer avec SCCO NE ou fiduciaire agréé.",
    ].join(" "),
  },
  {
    law: "Bareme-NE-PM-2026",
    rs: "RSN 631.0",
    topic: ["deductions", "icc", "pm", "ne", "lcdir", "pertes", "rd", "exoneration"],
    canton: "NE",
    year: 2026,
    heading: "Déductions et exonérations PM Neuchâtel 2026 — LCdir RSN 631.0",
    text: [
      "Déductions et exonérations impôt PM Neuchâtel 2026.",
      "Source : LCdir RSN 631.0 — SCCO NE.",
      "Report de pertes PM : 7 ans en avant (art. 67 LIFD applicable par analogie en ICC NE).",
      "Déduction recherche-développement : déduction jusqu'à 150% des charges R&D qualifiantes (RFFA 2020).",
      "Déduction pour participations (Beteiligungsabzug) : réduction d'impôt proportionnelle au rendement net des participations ≥ 10%.",
      "Patent box NE : bénéfices issus de brevets et droits comparables imposés à taux réduit (RFFA).",
      "Exonération associations/fondations d'utilité publique : bénéfice net < CHF 20'000 exonéré.",
      "Exonération holdings : sociétés holding bénéficient du régime cantonal de participation.",
      "Amortissements admis : selon les barèmes AFC/SCCO NE — linéaire ou dégressif.",
      "Délai de dépôt déclaration fiscale PM NE : dans les 6 mois suivant la clôture de l'exercice.",
      "Estimation indicative — confirmer avec SCCO NE ou fiduciaire agréé.",
    ].join(" "),
  },
  {
    law: "Bareme-NE-PM-2026",
    rs: "RSN 631.0",
    topic: ["coefficients", "icc", "pm", "ne", "competitivite", "romand"],
    canton: "NE",
    year: 2026,
    heading: "Coefficient et compétitivité PM Neuchâtel 2026",
    text: [
      "Coefficient cantonal PM Neuchâtel 2026 : taux ICC bénéfice PM ~16.5% (canton + commune moyen).",
      "Structure : LCdir RSN 631.0 fixe un taux global ICC PM bénéfice intégrant canton et commune.",
      "Impôt capital PM NE : 0.45‰ — parmi les taux capital les plus compétitifs de Suisse romande.",
      "Comparatif romand ICC PM bénéfice : NE ~16.5%, JU ~15.5%, BJ ~18.6%, FR ~12.5%, VD ~13.5%, GE ~14.0%.",
      "NE se positionne dans la fourchette intermédiaire haute pour la charge PM en Suisse romande.",
      "Taux bénéfice effectif global (ICC + IFD) NE : environ 25% — dans la moyenne suisse.",
      "NE présente des avantages pour les industries watchmaking, medtech, fintech (historique industriel).",
      "Source : SCCO NE — www.ne.ch/autorites/DDF/SCCO.",
      "Estimation indicative — confirmer avec SCCO NE ou fiduciaire agréé.",
    ].join(" "),
  },

  // ── JURA (JU) ────────────────────────────────────────────────────────────
  {
    law: "Bareme-JU-PM-2026",
    rs: "RSJU 641.11",
    topic: ["bareme", "icc", "pm", "ju", "li-ju", "benefice", "capital"],
    canton: "JU",
    year: 2026,
    heading: "Barème ICC PM Jura 2026 — LI-JU RSJU 641.11",
    text: [
      "Barème impôt cantonal et communal (ICC) personnes morales (PM) Jura 2026.",
      "Source : Loi d'impôt du canton du Jura LI-JU RSJU 641.11.",
      "Autorité : SCCJ (Service cantonal des contributions du Jura).",
      "Taux ICC PM bénéfice : 15.5% du bénéfice net imposable (canton + commune inclus).",
      "Taux ICC PM capital : 0.50‰ des fonds propres imposables.",
      "IFD fédéral PM : 8.5% flat (art. 68 LIFD RS 642.11) — s'ajoute à l'ICC.",
      "Taux effectif estimé bénéfice (ICC + IFD) : ~24% pour une SA/Sàrl standard JU.",
      "Impôt minimum cantonal PM : CHF 100.",
      "JU est l'un des cantons romands les plus attractifs fiscalement pour les PM sur le bénéfice.",
      "Note : Moutier intégrée au canton du Jura depuis le 1er janvier 2021 — communes et taux unifiés.",
      "Estimation indicative — confirmer avec SCCJ ou fiduciaire agréé.",
    ].join(" "),
  },
  {
    law: "Bareme-JU-PM-2026",
    rs: "RSJU 641.11",
    topic: ["deductions", "icc", "pm", "ju", "li-ju", "pertes", "rd", "exoneration"],
    canton: "JU",
    year: 2026,
    heading: "Déductions et exonérations PM Jura 2026 — LI-JU RSJU 641.11",
    text: [
      "Déductions et exonérations impôt PM Jura 2026.",
      "Source : LI-JU RSJU 641.11 — SCCJ.",
      "Report de pertes PM : 7 ans en avant (conformément à l'harmonisation fédérale LIFD).",
      "Déduction recherche-développement : déduction jusqu'à 150% des charges R&D qualifiantes (RFFA 2020).",
      "Déduction pour participations (Beteiligungsabzug) : réduction d'impôt sur rendement net participations ≥ 10%.",
      "Patent box JU : bénéfices issus de brevets et droits comparables imposés à taux réduit (RFFA).",
      "Exonération associations/fondations d'utilité publique : bénéfice exonéré si poursuites non lucratives reconnues.",
      "Exonération partielle caisses de pension et institutions de prévoyance.",
      "Amortissements admis : selon les barèmes AFC/SCCJ — linéaire ou dégressif selon catégorie d'actifs.",
      "Délai de dépôt déclaration fiscale PM JU : dans les 6 mois suivant la clôture de l'exercice.",
      "Estimation indicative — confirmer avec SCCJ ou fiduciaire agréé.",
    ].join(" "),
  },
  {
    law: "Bareme-JU-PM-2026",
    rs: "RSJU 641.11",
    topic: ["coefficients", "icc", "pm", "ju", "moutier", "competitivite", "romand"],
    canton: "JU",
    year: 2026,
    heading: "Coefficient et compétitivité PM Jura 2026 — ICC PM 15.5%",
    text: [
      "Coefficient cantonal PM Jura 2026 : taux ICC bénéfice PM ~15.5% (canton + commune inclus).",
      "Structure LI-JU : le coefficient global 240% du barème PP ne s'applique pas aux PM — les PM sont taxées à taux fixe.",
      "Impôt capital PM JU : 0.50‰ — taux modéré, légèrement supérieur à NE.",
      "Comparatif romand ICC PM bénéfice : JU ~15.5%, NE ~16.5%, FR ~12.5%, VD ~13.5%, GE ~14.0%, BJ ~18.6%.",
      "JU est parmi les cantons romands les plus attractifs pour les PM sur le bénéfice (2e après FR).",
      "Taux bénéfice effectif global (ICC + IFD) JU : environ 24% — favorable.",
      "JU attire les PME grâce à son taux PM compétitif et sa proximité avec Berne et le bassin de Delémont.",
      "Source : SCCJ — www.jura.ch/DFI/SCC.",
      "Estimation indicative — confirmer avec SCCJ ou fiduciaire agréé.",
    ].join(" "),
  },

  // ── JURA BERNOIS (BJ) ─────────────────────────────────────────────────────
  {
    law: "Bareme-BJ-PM-2026",
    rs: "RSB 661.11",
    topic: ["bareme", "icc", "pm", "bj", "limp-be", "jura-bernois", "benefice", "capital"],
    canton: "BJ",
    year: 2026,
    heading: "Barème ICC PM Jura bernois 2026 — LIMP-BE RSB 661.11",
    text: [
      "Barème impôt cantonal et communal (ICC) personnes morales (PM) Jura bernois 2026.",
      "BJ = communes francophones du canton de Berne (Jura bernois + région de Bienne).",
      "Source : Loi sur les impôts du canton de Berne LIMP-BE RSB 661.11.",
      "Autorité : ADB section francophone (Administration fiscale du canton de Berne).",
      "Taux ICC PM bénéfice : 18.6% du bénéfice net imposable (canton + commune moyen Berne).",
      "Taux ICC PM capital : 0.30‰ des fonds propres imposables.",
      "IFD fédéral PM : 8.5% flat (art. 68 LIFD RS 642.11) — s'ajoute à l'ICC.",
      "Taux effectif estimé bénéfice (ICC + IFD) : ~27.1% pour une SA/Sàrl standard BJ.",
      "Impôt minimum cantonal PM Berne : CHF 150.",
      "BE est l'un des cantons avec la charge fiscale PM la plus élevée de Suisse romande.",
      "Estimation indicative — confirmer avec ADB section francophone ou fiduciaire agréé.",
    ].join(" "),
  },
  {
    law: "Bareme-BJ-PM-2026",
    rs: "RSB 661.11",
    topic: ["deductions", "icc", "pm", "bj", "limp-be", "pertes", "rd", "exoneration"],
    canton: "BJ",
    year: 2026,
    heading: "Déductions et exonérations PM Jura bernois 2026 — LIMP-BE RSB 661.11",
    text: [
      "Déductions et exonérations impôt PM Jura bernois (canton de Berne) 2026.",
      "Source : LIMP-BE RSB 661.11 — ADB section francophone.",
      "Report de pertes PM : 7 ans en avant (harmonisation fédérale LIFD applicable en ICC BE).",
      "Déduction recherche-développement : déduction jusqu'à 150% des charges R&D qualifiantes (RFFA 2020).",
      "Déduction pour participations (Beteiligungsabzug) : réduction d'impôt sur rendement net participations ≥ 10%.",
      "Patent box BE : bénéfices issus de brevets et droits comparables imposés à taux réduit (RFFA).",
      "Exonération associations/fondations d'utilité publique : bénéfice exonéré si But non lucratif reconnu.",
      "Exonération institutions de prévoyance (caisses de pension LPP) reconnues.",
      "Taux réduit pour sociétés holding BE : régime participation favorable sur dividendes et gains en capital.",
      "Délai de dépôt déclaration fiscale PM BE/BJ : dans les 6 mois suivant la clôture de l'exercice.",
      "Estimation indicative — confirmer avec ADB ou fiduciaire agréé.",
    ].join(" "),
  },
  {
    law: "Bareme-BJ-PM-2026",
    rs: "RSB 661.11",
    topic: ["coefficients", "icc", "pm", "bj", "be", "jura-bernois", "competitivite", "romand"],
    canton: "BJ",
    year: 2026,
    heading: "Coefficient et compétitivité PM Jura bernois 2026 — ICC PM 18.6%",
    text: [
      "Coefficient cantonal PM Berne 2026 : taux ICC bénéfice PM ~18.6% (cantonal BE + commune moyen).",
      "Structure LIMP-BE : les PM bernoises paient un impôt cantonal auquel s'ajoutent des centimes additionnels communaux.",
      "Impôt capital PM BJ : 0.30‰ — taux capital parmi les plus bas de Suisse romande, avantage comparatif.",
      "Comparatif romand ICC PM bénéfice : BJ ~18.6%, NE ~16.5%, GE ~14.0%, VD ~13.5%, JU ~15.5%, FR ~12.5%.",
      "BJ présente la charge fiscale PM bénéfice la plus élevée de Suisse romande.",
      "Compensé partiellement par un taux capital très bas (0.30‰) — favorable aux entreprises capitalistiques.",
      "Taux bénéfice effectif global (ICC + IFD) BJ : environ 27.1% — parmi les plus élevés.",
      "Les PME BJ pâtissent de la charge fiscale élevée vs JU et FR — incitation au transfert de siège.",
      "Source : ADB — www.taxinfo.sv.fin.be.ch.",
      "Estimation indicative — confirmer avec ADB ou fiduciaire agréé.",
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
    law_label: `Barème PM 2026 — ${point.canton}`,
    article: point.heading,
    article_num: `${point.canton}-PM-2026-${idx}`,
    heading: point.heading,
    rs: point.rs,
    topic: point.topic.join(","),
    category: "bareme_pm",
    canton: point.canton,
    year: point.year,
    date_version: "2026-04-21",
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
    console.log(`[baremes-pm] Points ${law} supprimés (idempotent)`);
  } catch (err) {
    console.warn(`[baremes-pm] Delete ${law} skipped:`, (err as Error).message);
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
  console.log(`[baremes-pm-ne-ju-bj] QDRANT   : ${QDRANT_URL}`);
  console.log(`[baremes-pm-ne-ju-bj] EMBEDDER : ${EMBEDDER_URL}`);
  console.log(`[baremes-pm-ne-ju-bj] COLLECTION: ${COLLECTION}`);
  console.log(`[baremes-pm-ne-ju-bj] Points à ingérer: ${POINTS.length}`);

  // 1. Delete existing (idempotent)
  const laws = [...new Set(POINTS.map((p) => p.law))];
  for (const law of laws) {
    await deleteExisting(law);
  }

  // 2. Build payloads
  const payloads = POINTS.map((p, i) => buildPayload(p, i));
  const texts = payloads.map((p) => p.text);

  // 3. Embed
  console.log("[baremes-pm-ne-ju-bj] Embedding via BGE-M3...");
  const t0 = Date.now();
  const vectors = await embedTexts(texts);
  console.log(
    `[baremes-pm-ne-ju-bj] ${vectors.length} vecteurs produits en ${Date.now() - t0}ms (dim=${vectors[0]?.length ?? "?"})`,
  );

  // 4. Upsert
  const before = await countPoints();
  console.log(`[baremes-pm-ne-ju-bj] Points avant: ${before}`);
  await upsertPoints(payloads, vectors);
  const after = await countPoints();
  console.log(`[baremes-pm-ne-ju-bj] Points après: ${after} (+${after - before})`);

  // 5. Smoke test
  console.log("\n[baremes-pm-ne-ju-bj] === Smoke test RAG ===");
  const testQueries = [
    "barème impôt PM Neuchâtel 2026 bénéfice",
    "ICC personnes morales Jura capital",
    "déductions PM Jura bernois exonérations",
    "taux effectif impôt BJ PM bénéfice",
    "coefficient cantonal NE JU BJ PM",
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
      const isNew = ["Bareme-NE-PM-2026", "Bareme-JU-PM-2026", "Bareme-BJ-PM-2026"].includes(hit.payload.law);
      const mark = isNew ? "[NE/JU/BJ-PM]" : "             ";
      console.log(
        `    ${mark} [${hit.score.toFixed(3)}] ${hit.payload.law} — ${(hit.payload.heading ?? hit.payload.text ?? "").slice(0, 60)}`,
      );
    }
  }

  console.log("\n[baremes-pm-ne-ju-bj] DONE");
}

main().catch((err: unknown) => {
  console.error("[baremes-pm-ne-ju-bj] FATAL:", err);
  process.exit(1);
});
