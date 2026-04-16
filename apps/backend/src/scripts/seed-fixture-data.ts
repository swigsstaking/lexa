/**
 * seed-fixture-data — hydrate le tenant demo avec données réalistes 2026.
 *
 * Exécution :
 *   tsx src/scripts/seed-fixture-data.ts
 *
 * Idempotent : ON CONFLICT DO NOTHING + upserts Mongo. Rejouable N fois.
 *
 * Credentials demo :
 *   email    = demo@lexa.test
 *   password = LexaDemo2026!
 *   tenant   = 00000000-0000-0000-0000-000000000099 (UUID stable)
 *
 * Ce tenant est hors range production. Usage exclusif : testbed, démo fiduciaire.
 */

import { randomUUID } from "node:crypto";
import { query, closePool } from "../db/postgres.js";
import { connectMongo } from "../db/mongo.js";
import { hashPassword } from "../auth/jwt.js";

const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000099";
const DEMO_EMAIL = "demo@lexa.test";
const DEMO_PASSWORD = "LexaDemo2026!";

// ─── Dataset transactions ─────────────────────────────────────────────────────
// 20 transactions réalistes 2026 — mix CRDT/DBIT
// Revenus visés ~300k CHF, Charges ~180k CHF, Bénéfice ~120k CHF
// Comptes plan comptable PME Suisse (PCN) :
//   1020 = Banque, 3200 = Ventes produits, 3400 = Prestations services
//   5000 = Charges personnel, 5900 = Frais divers, 6000 = Loyer
//   6500 = Assurances/cotisations, 2200 = TVA due à AFC

type TxData = {
  date: string;
  description: string;
  amount: number; // positif = CRDT banque, négatif = DBIT banque
  creditDebit: "CRDT" | "DBIT";
  debitAccount: string;
  creditAccount: string;
  tvaRate: number;
};

const TRANSACTIONS: TxData[] = [
  // ── Revenus (CRDT) ────────────────────────────────────────────────────────
  { date: "2026-01-15", description: "Client ABC SA facture 2026-001", amount: 12960, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3200", tvaRate: 8.1 },
  { date: "2026-02-10", description: "Client Duvanel SARL paiement facture 2026-003", amount: 9180, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3200", tvaRate: 8.1 },
  { date: "2026-02-28", description: "Client Rieder & Partner honoraires conseil", amount: 5400, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3400", tvaRate: 8.1 },
  { date: "2026-03-20", description: "Client ABC SA facture 2026-012", amount: 21600, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3200", tvaRate: 8.1 },
  { date: "2026-04-05", description: "Client Valais Invest SA acompte projet alpha", amount: 32400, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3400", tvaRate: 8.1 },
  { date: "2026-05-15", description: "Client Duvanel SARL facture 2026-021", amount: 15120, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3200", tvaRate: 8.1 },
  { date: "2026-06-30", description: "Client Hotel Rhone SA prestation semestre 1", amount: 43200, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3400", tvaRate: 8.1 },
  { date: "2026-07-10", description: "Client ABC SA facture Q3-2026", amount: 18900, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3200", tvaRate: 8.1 },
  { date: "2026-08-22", description: "Client Syntech Sion SA virement", amount: 27000, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3200", tvaRate: 8.1 },
  { date: "2026-09-15", description: "Client Valais Invest SA solde projet alpha", amount: 48600, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3400", tvaRate: 8.1 },
  { date: "2026-10-05", description: "Client Rieder & Partner formation Q4", amount: 10800, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3400", tvaRate: 8.1 },
  { date: "2026-11-20", description: "Client ABC SA facture annuelle 2026-final", amount: 37800, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3200", tvaRate: 8.1 },
  { date: "2026-12-15", description: "Client Hotel Rhone SA prestation semestre 2", amount: 43200, creditDebit: "CRDT", debitAccount: "1020", creditAccount: "3400", tvaRate: 8.1 },

  // ── Charges (DBIT) ────────────────────────────────────────────────────────
  { date: "2026-01-05", description: "LOYER SOGESTIM SA janvier 2026", amount: -3500, creditDebit: "DBIT", debitAccount: "6000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-04-05", description: "LOYER SOGESTIM SA avril 2026", amount: -3500, creditDebit: "DBIT", debitAccount: "6000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-07-05", description: "LOYER SOGESTIM SA juillet 2026", amount: -3500, creditDebit: "DBIT", debitAccount: "6000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-10-05", description: "LOYER SOGESTIM SA octobre 2026", amount: -3500, creditDebit: "DBIT", debitAccount: "6000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-01-25", description: "SALAIRE DUPONT JEAN janvier 2026", amount: -5200, creditDebit: "DBIT", debitAccount: "5000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-04-25", description: "SALAIRE DUPONT JEAN avril 2026", amount: -5200, creditDebit: "DBIT", debitAccount: "5000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-07-25", description: "SALAIRE DUPONT JEAN juillet 2026", amount: -5200, creditDebit: "DBIT", debitAccount: "5000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-10-25", description: "SALAIRE DUPONT JEAN octobre 2026", amount: -5200, creditDebit: "DBIT", debitAccount: "5000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-02-15", description: "SALAIRE MARTIN ANNE fevrier 2026", amount: -4800, creditDebit: "DBIT", debitAccount: "5000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-05-15", description: "SALAIRE MARTIN ANNE mai 2026", amount: -4800, creditDebit: "DBIT", debitAccount: "5000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-08-15", description: "SALAIRE MARTIN ANNE aout 2026", amount: -4800, creditDebit: "DBIT", debitAccount: "5000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-11-15", description: "SALAIRE MARTIN ANNE novembre 2026", amount: -4800, creditDebit: "DBIT", debitAccount: "5000", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-03-31", description: "ACOMPTE TVA AFC Q1-2026", amount: -8500, creditDebit: "DBIT", debitAccount: "2200", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-06-30", description: "ACOMPTE TVA AFC Q2-2026", amount: -12500, creditDebit: "DBIT", debitAccount: "2200", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-09-30", description: "ACOMPTE TVA AFC Q3-2026", amount: -14200, creditDebit: "DBIT", debitAccount: "2200", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-01-20", description: "MIGROS MARTIGNY fournitures bureau", amount: -185, creditDebit: "DBIT", debitAccount: "5900", creditAccount: "1020", tvaRate: 8.1 },
  { date: "2026-03-10", description: "SWISSCOM SA abonnement telephonie Q1", amount: -450, creditDebit: "DBIT", debitAccount: "6500", creditAccount: "1020", tvaRate: 8.1 },
  { date: "2026-06-10", description: "SWISSCOM SA abonnement telephonie Q2", amount: -450, creditDebit: "DBIT", debitAccount: "6500", creditAccount: "1020", tvaRate: 8.1 },
  { date: "2026-09-10", description: "SWISSCOM SA abonnement telephonie Q3", amount: -450, creditDebit: "DBIT", debitAccount: "6500", creditAccount: "1020", tvaRate: 8.1 },
  { date: "2026-12-10", description: "SWISSCOM SA abonnement telephonie Q4", amount: -450, creditDebit: "DBIT", debitAccount: "6500", creditAccount: "1020", tvaRate: 8.1 },
  { date: "2026-06-15", description: "HELVETIA ASSURANCES prime annuelle RC", amount: -3200, creditDebit: "DBIT", debitAccount: "6500", creditAccount: "1020", tvaRate: 0 },
  { date: "2026-09-20", description: "OFFICE WORLD materiels informatique", amount: -2800, creditDebit: "DBIT", debitAccount: "5900", creditAccount: "1020", tvaRate: 8.1 },
];

// ─── AI decisions fixtures ────────────────────────────────────────────────────
const AI_DECISIONS_DATA = [
  {
    agent: "classifier",
    model: "comptable-suisse-fast",
    confidence: 0.92,
    reasoning: "Virement client avec référence facture identifiable. Compte 3200 Ventes produits, compte 1020 Banque.",
    citations: [{ law: "CO", article: "957", rs: "220", heading: "Obligation de tenir une comptabilité" }],
    alternatives: [{ account: "3400", confidence: 0.15 }],
  },
  {
    agent: "classifier",
    model: "comptable-suisse-fast",
    confidence: 0.88,
    reasoning: "Loyer commercial mensuel. Compte 6000 Loyers, débit sur 1020 Banque. TVA non applicable (non assujetti bailleur).",
    citations: [{ law: "CO", article: "258", rs: "220", heading: "Bail à loyer commercial" }],
    alternatives: [{ account: "6100", confidence: 0.08 }],
  },
  {
    agent: "classifier",
    model: "comptable-suisse-fast",
    confidence: 0.95,
    reasoning: "Salaire brut mensuel. Charges salariales CO. Compte 5000 Charges de personnel.",
    citations: [{ law: "CO", article: "322", rs: "220", heading: "Salaire — contrat de travail" }],
    alternatives: [],
  },
  {
    agent: "classifier",
    model: "comptable-suisse-fast",
    confidence: 0.78,
    reasoning: "Fournitures de bureau. Classification 5900 Charges diverses selon plan comptable PME.",
    citations: [{ law: "LTVA", article: "28", rs: "641.20", heading: "Droit à la déduction de l'impôt préalable" }],
    alternatives: [{ account: "6600", confidence: 0.20 }],
  },
  {
    agent: "classifier",
    model: "comptable-suisse-fast",
    confidence: 0.65,
    reasoning: "Acompte TVA AFC. Classification 2200 TVA due. Paiement trimestriel standard.",
    citations: [{ law: "LTVA", article: "71", rs: "641.20", heading: "Décompte et paiement" }],
    alternatives: [{ account: "2201", confidence: 0.30 }],
  },
];

// ─── Seed functions ───────────────────────────────────────────────────────────

async function seedCompanyAndUser(): Promise<void> {
  console.log("[seed] seedCompanyAndUser...");

  // Vérifie si company existe déjà
  const existingCompany = await query(
    "SELECT id FROM companies WHERE tenant_id = $1",
    [DEMO_TENANT_ID],
  );

  if (existingCompany.rows.length === 0) {
    await query(
      `INSERT INTO companies (
         tenant_id, name, legal_form, legal_form_label, uid, street, zip, city,
         canton, country, is_vat_subject, vat_number, vat_declaration_frequency,
         vat_method, source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [
        DEMO_TENANT_ID,
        "Demo Sàrl",
        "sarl",
        "Sàrl",
        "CHE-100.200.300",
        "Rue de la Gare 12",
        "1950",
        "Sion",
        "VS",
        "CH",
        true,
        "CHE-100.200.300",
        "quarterly",
        "effective",
        "manual",
      ],
    );
    console.log("[seed]   → company Demo Sàrl créée");
  } else {
    console.log("[seed]   → company déjà existante, skip");
  }

  // User
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const existingUser = await query(
    "SELECT id FROM users WHERE email = $1",
    [DEMO_EMAIL],
  );

  if (existingUser.rows.length === 0) {
    await query(
      `INSERT INTO users (email, password_hash, tenant_id, verified)
       VALUES ($1, $2, $3, true)`,
      [DEMO_EMAIL, passwordHash, DEMO_TENANT_ID],
    );
    console.log("[seed]   → user demo@lexa.test créé");
  } else {
    // Met à jour le password au cas où
    await query(
      "UPDATE users SET password_hash = $1, verified = true WHERE email = $2",
      [passwordHash, DEMO_EMAIL],
    );
    console.log("[seed]   → user déjà existant, password reset");
  }
}

async function seedEvents(): Promise<void> {
  console.log("[seed] seedEvents...");

  // Vérifie combien d'events on a déjà pour ce tenant
  const existing = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM events WHERE tenant_id = $1",
    [DEMO_TENANT_ID],
  );
  const existingCount = Number(existing.rows[0]?.count ?? 0);

  if (existingCount > 0) {
    console.log(`[seed]   → ${existingCount} events déjà existants, skip (idempotent)`);
    return;
  }

  let inserted = 0;

  for (const tx of TRANSACTIONS) {
    const streamId = randomUUID();
    const amountAbs = Math.abs(tx.amount);

    // Event 1 : TransactionIngested
    await query(
      `INSERT INTO events (tenant_id, stream_id, sequence, type, payload, metadata, occurred_at)
       VALUES ($1, $2, 1, 'TransactionIngested', $3::jsonb, '{}'::jsonb, $4)`,
      [
        DEMO_TENANT_ID,
        streamId,
        JSON.stringify({
          source: "manual",
          date: tx.date,
          description: tx.description,
          amount: tx.creditDebit === "CRDT" ? amountAbs : -amountAbs,
          currency: "CHF",
        }),
        new Date(tx.date),
      ],
    );

    // Event 2 : TransactionClassified
    const amountHt = tx.tvaRate > 0
      ? Math.round((amountAbs / (1 + tx.tvaRate / 100)) * 100) / 100
      : amountAbs;

    await query(
      `INSERT INTO events (tenant_id, stream_id, sequence, type, payload, metadata, occurred_at)
       VALUES ($1, $2, 2, 'TransactionClassified', $3::jsonb, '{}'::jsonb, $4)`,
      [
        DEMO_TENANT_ID,
        streamId,
        JSON.stringify({
          transactionStreamId: streamId,
          agent: "classifier",
          model: "comptable-suisse-fast",
          confidence: 0.85 + Math.random() * 0.10,
          debitAccount: tx.debitAccount,
          creditAccount: tx.creditAccount,
          amountHt: parseFloat(amountHt.toFixed(2)),
          amountTtc: amountAbs,
          tvaRate: tx.tvaRate,
          tvaCode: tx.tvaRate > 0 ? "TVA81" : "NOTVA",
          costCenter: "SION-PRINCIPAL",
          reasoning: `Classification automatique — ${tx.description}`,
          citations: [{ law: "CO", article: "957", rs: "220" }],
          alternatives: [],
        }),
        new Date(tx.date),
      ],
    );

    inserted++;
  }

  console.log(`[seed]   → ${inserted} transactions insérées (${inserted * 2} events)`);
}

async function seedAiDecisions(): Promise<void> {
  console.log("[seed] seedAiDecisions...");

  // Récupère quelques event_ids de TransactionClassified pour ce tenant
  const events = await query<{ id: number }>(
    `SELECT id FROM events WHERE tenant_id = $1 AND type = 'TransactionClassified' LIMIT 5`,
    [DEMO_TENANT_ID],
  );

  if (events.rows.length === 0) {
    console.log("[seed]   → pas d'events classifiés, skip ai_decisions");
    return;
  }

  // Vérifie si ai_decisions existent déjà
  const existingDecisions = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM ai_decisions WHERE tenant_id = $1",
    [DEMO_TENANT_ID],
  );
  if (Number(existingDecisions.rows[0]?.count ?? 0) > 0) {
    console.log("[seed]   → ai_decisions déjà existantes, skip");
    return;
  }

  for (let i = 0; i < Math.min(AI_DECISIONS_DATA.length, events.rows.length); i++) {
    const d = AI_DECISIONS_DATA[i]!;
    const eventId = events.rows[i]!.id;

    await query(
      `INSERT INTO ai_decisions (event_id, tenant_id, agent, model, confidence, reasoning, citations, alternatives, rag_context)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, '[]'::jsonb)`,
      [
        eventId,
        DEMO_TENANT_ID,
        d.agent,
        d.model,
        d.confidence,
        d.reasoning,
        JSON.stringify(d.citations),
        JSON.stringify(d.alternatives),
      ],
    );
  }

  console.log(`[seed]   → ${Math.min(AI_DECISIONS_DATA.length, events.rows.length)} ai_decisions insérées`);
}

async function seedDocuments(): Promise<void> {
  console.log("[seed] seedDocuments...");
  const { db } = await connectMongo();
  const coll = db.collection("documents_meta");

  const docs = [
    {
      documentId: "seed-doc-1-cert-salaire",
      tenantId: DEMO_TENANT_ID,
      gridfsId: "seed-placeholder-1",
      filename: "cert_salaire_2025.pdf",
      mimetype: "application/pdf",
      size: 45120,
      uploadedAt: new Date("2026-02-15"),
      appliedToDrafts: [],
      ocrResult: {
        rawText: "CERTIFICAT DE SALAIRE 2025\nEmployeur: Demo Sàrl, Sion\nEmployé: Jean Demo\nAVS 7561234567890\nSalaire brut: CHF 85000.00\nSalaire net: CHF 72500.00\nDéductions AVS/LPP: CHF 8500.00\nPériode: 01.01.2025 - 31.12.2025",
        extractionMethod: "qwen3-vl-ocr",
        ocrConfidence: 0.90,
        type: "certificat_salaire",
        extractedFields: {
          employer: "Demo Sàrl, Sion",
          employeeName: "Jean Demo",
          grossSalary: 85000,
          netSalary: 72500,
          deductionsAvsLpp: 8500,
          year: 2025,
          period: "01.01.2025 - 31.12.2025",
        },
        durationMs: 3200,
      },
    },
    {
      documentId: "seed-doc-2-attestation-3a",
      tenantId: DEMO_TENANT_ID,
      gridfsId: "seed-placeholder-2",
      filename: "attestation_3a_2025.pdf",
      mimetype: "application/pdf",
      size: 12800,
      uploadedAt: new Date("2026-02-20"),
      appliedToDrafts: [],
      ocrResult: {
        rawText: "ATTESTATION PILIER 3A 2025\nTitulaire: Jean Demo, Sion\nCompte 3a No: CH98 0900 0000 1234 5678 9\nVersements 2025: CHF 7260.00\nInstitution: Banque Cantonale du Valais SA\nDate: 31.01.2026",
        extractionMethod: "qwen3-vl-ocr",
        ocrConfidence: 0.93,
        type: "attestation_3a",
        extractedFields: {
          holderName: "Jean Demo",
          holderCommune: "Sion",
          amount: 7260,
          year: 2025,
          institution: "Banque Cantonale du Valais SA",
          accountNumber: "CH98 0900 0000 1234 5678 9",
        },
        durationMs: 2100,
      },
    },
    {
      documentId: "seed-doc-3-facture",
      tenantId: DEMO_TENANT_ID,
      gridfsId: "seed-placeholder-3",
      filename: "facture_bureau_sa_2026.pdf",
      mimetype: "application/pdf",
      size: 28400,
      uploadedAt: new Date("2026-03-10"),
      appliedToDrafts: [],
      ocrResult: {
        rawText: "FACTURE No 2026-0042\nFournisseur: Bureau SA, Lausanne\nDate: 05.03.2026\nDescription: Mobilier bureau ergonomique\nMontant HT: CHF 1109.16\nTVA 8.1%: CHF 89.84\nMontant TTC: CHF 1200.00\nConditions: 30 jours net",
        extractionMethod: "qwen3-vl-ocr",
        ocrConfidence: 0.87,
        type: "facture",
        extractedFields: {
          vendor: "Bureau SA",
          vendorCity: "Lausanne",
          invoiceNumber: "2026-0042",
          date: "2026-03-05",
          description: "Mobilier bureau ergonomique",
          amountHt: 1109.16,
          tvaRate: 8.1,
          amountTva: 89.84,
          amountTtc: 1200,
        },
        durationMs: 2800,
      },
    },
  ];

  for (const doc of docs) {
    await coll.updateOne(
      { documentId: doc.documentId },
      { $set: doc },
      { upsert: true },
    );
  }

  console.log(`[seed]   → ${docs.length} documents Mongo upserted`);
}

async function seedDrafts(): Promise<void> {
  console.log("[seed] seedDrafts...");

  // taxpayer_draft PP VS 2026
  await query(
    `INSERT INTO taxpayer_drafts (tenant_id, fiscal_year, state, current_step)
     VALUES ($1, 2026, $2::jsonb, 4)
     ON CONFLICT (tenant_id, fiscal_year) DO UPDATE SET
       state = EXCLUDED.state,
       current_step = EXCLUDED.current_step`,
    [
      DEMO_TENANT_ID,
      JSON.stringify({
        step1: {
          firstName: "Jean",
          lastName: "Demo",
          commune: "Sion",
          canton: "VS",
          civilStatus: "single",
          childrenCount: 0,
        },
        step2: {
          salaireBrut: 85000,
          salaireNet: 72500,
          certificatSalaire: true,
        },
        step3: {
          pilier3a: 7260,
          fraisProfessionnels: 2800,
          interessesDettes: 0,
        },
        step4: {
          fortuneMobiliere: 15000,
          fortuneImmobiliere: 0,
        },
      }),
    ],
  );
  console.log("[seed]   → taxpayer_draft PP VS 2026 upserted");

  // company_draft PM VS 2026
  await query(
    `INSERT INTO company_drafts (tenant_id, year, canton, state)
     VALUES ($1, 2026, 'VS', $2::jsonb)
     ON CONFLICT (tenant_id, year, canton) DO UPDATE SET
       state = EXCLUDED.state`,
    [
      DEMO_TENANT_ID,
      JSON.stringify({
        step1: {
          legalName: "Demo Sàrl",
          legalForm: "sarl",
          ideNumber: "CHE-100.200.300",
          siegeCommune: "Sion",
          siegeStreet: "Rue de la Gare 12",
          siegeZip: "1950",
          fiscalYearStart: "2026-01-01",
          fiscalYearEnd: "2026-12-31",
        },
        step2: {
          benefitAccounting: 180000,
          chiffreAffaires: 300000,
          chargesPersonnel: 62400,
          chargesMaterielles: 8000,
          amortissementsComptables: 5000,
          autresCharges: 14000,
        },
        step3: {
          chargesNonAdmises: 5000,
          provisionsExcessives: 0,
          amortissementsExcessifs: 0,
          reservesLatentes: 0,
          autresCorrections: 0,
        },
        step4: {
          capitalSocial: 20000,
          reservesLegales: 10000,
          reservesLibres: 50000,
          reportBenefice: 20000,
          capitalTotal: 100000,
        },
      }),
    ],
  );
  console.log("[seed]   → company_draft PM VS 2026 upserted");
}

async function refreshMv(): Promise<void> {
  console.log("[seed] REFRESH MATERIALIZED VIEW ledger_entries...");
  await query("REFRESH MATERIALIZED VIEW ledger_entries");
  console.log("[seed]   → MV rafraîchie");
}

async function verify(): Promise<void> {
  console.log("[seed] Vérification post-seed...");

  const eventsCount = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM events WHERE tenant_id = $1",
    [DEMO_TENANT_ID],
  );
  console.log(`[seed]   events: ${eventsCount.rows[0]?.count}`);

  const ledgerCount = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM ledger_entries WHERE tenant_id = $1",
    [DEMO_TENANT_ID],
  );
  console.log(`[seed]   ledger_entries: ${ledgerCount.rows[0]?.count}`);

  const aiDecisionsCount = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM ai_decisions WHERE tenant_id = $1",
    [DEMO_TENANT_ID],
  );
  console.log(`[seed]   ai_decisions: ${aiDecisionsCount.rows[0]?.count}`);

  const taxpayerDraft = await query<{ id: string }>(
    "SELECT id FROM taxpayer_drafts WHERE tenant_id = $1 AND fiscal_year = 2026",
    [DEMO_TENANT_ID],
  );
  console.log(`[seed]   taxpayer_draft: ${taxpayerDraft.rows.length > 0 ? "OK" : "MISSING"}`);

  const companyDraft = await query<{ id: string }>(
    "SELECT id FROM company_drafts WHERE tenant_id = $1 AND year = 2026 AND canton = 'VS'",
    [DEMO_TENANT_ID],
  );
  console.log(`[seed]   company_draft: ${companyDraft.rows.length > 0 ? "OK" : "MISSING"}`);

  // Résumé ledger
  const ledgerSummary = await query<{ account: string; total: string }>(
    `SELECT account, SUM(amount)::text AS total
     FROM ledger_entries
     WHERE tenant_id = $1
       AND transaction_date BETWEEN '2026-01-01' AND '2026-12-31'
     GROUP BY account
     ORDER BY account`,
    [DEMO_TENANT_ID],
  );
  console.log("[seed]   Ledger par compte:");
  for (const row of ledgerSummary.rows) {
    console.log(`[seed]     ${row.account}: ${row.total} CHF`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[seed] ═══════════════════════════════════════");
  console.log("[seed] Seed fixture data — tenant demo Lexa");
  console.log("[seed] ═══════════════════════════════════════");

  await seedCompanyAndUser();
  await seedEvents();
  await seedAiDecisions();
  await seedDocuments();
  await seedDrafts();
  await refreshMv();
  await verify();

  console.log("[seed] ═══════════════════════════════════════");
  console.log("[seed] Done! Tenant: " + DEMO_TENANT_ID);
  console.log("[seed] Login: demo@lexa.test / LexaDemo2026!");
  console.log("[seed] ═══════════════════════════════════════");
}

main()
  .catch((err) => {
    console.error("[seed] FATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
