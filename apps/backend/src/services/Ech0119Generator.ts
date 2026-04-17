/**
 * Générateur XML eCH-0119 v4.0.0 — E-Tax Filing pour personnes physiques (PP)
 *
 * Standard suisse officiel pour l'échange électronique de déclarations fiscales.
 * Source : https://www.ech.ch/fr/ech/ech-0119/4.0.0
 * Namespace : http://www.ech.ch/xmlns/eCH-0119/4
 *
 * Note: eCH-0217 = TVA uniquement. eCH-0119 = impôt PP. eCH-0229 = impôt PM.
 */

import { create } from "xmlbuilder2";

// ─── Types internes ────────────────────────────────────────────────────────────

export interface Ech0119PpInput {
  /** Année fiscale (ex: 2026) */
  year: number;
  /** Code canton (VS, GE, VD, FR) */
  canton: string;
  /** Identité contribuable */
  identity: {
    firstName?: string;
    lastName?: string;
    /** AVS/AHV number (format: 756.xxxx.xxxx.xx) — optionnel */
    avs?: string;
    dateOfBirth?: string; // ISO date YYYY-MM-DD
    civilStatus?: "single" | "married" | "registered_partnership" | "divorced" | "separated" | "widowed";
    commune?: string;
    childrenCount?: number;
  };
  /** Revenus en CHF */
  revenues: {
    salaireBrut?: number;
    revenusAccessoires?: number;
    rentesAvs?: number;
    rentesLpp?: number;
    rentes3ePilier?: number;
    allocations?: number;
    revenusTitres?: number;
    revenusImmobiliers?: number;
  };
  /** Fortune en CHF */
  assets: {
    comptesBancaires?: number;
    titresCotes?: number;
    titresNonCotes?: number;
    immeublesValeurFiscale?: number;
    immeublesEmprunt?: number;
    vehicules?: number;
    autresBiens?: number;
    dettes?: number;
  };
  /** Déductions en CHF */
  deductions: {
    pilier3a?: number;
    primesAssurance?: number;
    fraisProFormat?: "forfait" | "reel";
    fraisProReels?: number;
    interetsPassifs?: number;
    rachatsLpp?: number;
    fraisMedicaux?: number;
    dons?: number;
  };
}

export interface Ech0119PmInput {
  /** Année fiscale */
  year: number;
  /** Code canton */
  canton: string;
  /** Identité société */
  identity: {
    legalName?: string;
    legalForm?: string;
    ideNumber?: string;
    siegeCommune?: string;
  };
  /** Comptes financiers */
  financials: {
    chiffreAffaires?: number;
    benefitAccounting?: number;
    chargesPersonnel?: number;
    chargesMaterielles?: number;
    amortissementsComptables?: number;
    autresCharges?: number;
  };
  /** Corrections fiscales */
  corrections: {
    chargesNonAdmises?: number;
    provisionsExcessives?: number;
    amortissementsExcessifs?: number;
    autresCorrections?: number;
  };
  /** Capital */
  capital: {
    capitalSocial?: number;
    reservesLegales?: number;
    reservesLibres?: number;
    reportBenefice?: number;
  };
}

// ─── Mapping état civil → code eCH-0119 ────────────────────────────────────────

const CIVIL_STATUS_MAP: Record<string, string> = {
  single: "0",              // célibataire
  married: "1",             // marié/e
  registered_partnership: "1", // assimilé au mariage fiscalement
  divorced: "2",            // divorcé/e
  separated: "3",           // séparé/e judiciairement
  widowed: "4",             // veuf/veuve
};

function mapCivilStatus(s?: string): string {
  return s ? (CIVIL_STATUS_MAP[s] ?? "0") : "0";
}

// ─── Arrondi CHF (entier) ──────────────────────────────────────────────────────

function chf(val?: number): string {
  return String(Math.round(val ?? 0));
}

// ─── Générateur PP (eCH-0119-ir) ───────────────────────────────────────────────

/**
 * Génère un fichier XML eCH-0119 v4.0.0 pour une déclaration PP.
 *
 * La structure suit strictement le XSD officiel:
 * - message (racine)
 *   - header: taxPeriod + canton + source
 *   - content
 *     - mainForm
 *       - personDataPartner1 (identité, statut matrimonial)
 *       - revenue (revenus bruts par catégorie)
 *       - deduction (déductions détaillées)
 *       - asset (fortune brute, dettes)
 */
export function generateEch0119PpXml(input: Ech0119PpInput): string {
  const { year, canton, identity, revenues, assets, deductions } = input;

  // Calcul des totaux pour revenueCalculation
  const totalRevenuBrut =
    (revenues.salaireBrut ?? 0) +
    (revenues.revenusAccessoires ?? 0) +
    (revenues.rentesAvs ?? 0) +
    (revenues.rentesLpp ?? 0) +
    (revenues.rentes3ePilier ?? 0) +
    (revenues.allocations ?? 0) +
    (revenues.revenusTitres ?? 0) +
    (revenues.revenusImmobiliers ?? 0);

  const fraisProForfait = deductions.fraisProFormat === "reel"
    ? (deductions.fraisProReels ?? 0)
    : Math.min(Math.round((revenues.salaireBrut ?? 0) * 0.03), 4000);

  const totalDeductions =
    fraisProForfait +
    (deductions.pilier3a ?? 0) +
    (deductions.primesAssurance ?? 0) +
    (deductions.interetsPassifs ?? 0) +
    (deductions.rachatsLpp ?? 0) +
    (deductions.fraisMedicaux ?? 0) +
    (deductions.dons ?? 0);

  const revenuImposable = Math.max(0, totalRevenuBrut - totalDeductions);

  const fortuneBrute =
    (assets.comptesBancaires ?? 0) +
    (assets.titresCotes ?? 0) +
    (assets.titresNonCotes ?? 0) +
    (assets.immeublesValeurFiscale ?? 0) +
    (assets.vehicules ?? 0) +
    (assets.autresBiens ?? 0);

  const dettes =
    (assets.dettes ?? 0) +
    (assets.immeublesEmprunt ?? 0);

  const fortuneNette = Math.max(0, fortuneBrute - dettes);

  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("message", {
      "xmlns": "http://www.ech.ch/xmlns/eCH-0119/4",
      "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "xsi:schemaLocation": "http://www.ech.ch/xmlns/eCH-0119/4 eCH-0119-4-0-0.xsd",
      "minorVersion": "0",
    });

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.ele("header")
    .ele("taxPeriod").txt(String(year)).up()
    .ele("canton").txt(canton.toUpperCase()).up()
    .ele("source").txt("0").up()       // 0 = Software
    .ele("sourceDescription").txt("Lexa - Comptabilité IA Suisse").up()
    .up();

  // ── Content ─────────────────────────────────────────────────────────────────
  const content = doc.ele("content");
  const mainForm = content.ele("mainForm");

  // ── personDataPartner1 ──────────────────────────────────────────────────────
  const partner1 = mainForm.ele("personDataPartner1");
  const personId = partner1.ele("partnerPersonIdentification");

  if (identity.lastName) personId.ele("officialName").txt(identity.lastName);
  if (identity.firstName) personId.ele("firstName").txt(identity.firstName);
  if (identity.avs) personId.ele("vn").txt(identity.avs);
  personId.up();

  // Statut matrimonial fiscal
  partner1.ele("maritalStatusTax").txt(mapCivilStatus(identity.civilStatus));

  // Commune de résidence fiscale
  if (identity.commune) {
    partner1.ele("taxMunicipality").txt(identity.commune);
  }

  // Nombre d'enfants (via childData en éléments séparés)
  if (identity.childrenCount && identity.childrenCount > 0) {
    for (let i = 0; i < identity.childrenCount; i++) {
      mainForm.ele("childData")
        .ele("childDeductionType").txt("1")  // 1 = enfant mineur à charge
        .up();
    }
  }

  partner1.up();

  // ── revenue ─────────────────────────────────────────────────────────────────
  if (totalRevenuBrut > 0) {
    const revenue = mainForm.ele("revenue");

    if ((revenues.salaireBrut ?? 0) > 0) {
      revenue.ele("employedMainRevenue")
        .ele("cantonalTax").txt(chf(revenues.salaireBrut)).up()
        .ele("federalTax").txt(chf(revenues.salaireBrut)).up()
        .up();
    }

    if ((revenues.revenusAccessoires ?? 0) > 0) {
      revenue.ele("employedSidelineRevenue")
        .ele("cantonalTax").txt(chf(revenues.revenusAccessoires)).up()
        .ele("federalTax").txt(chf(revenues.revenusAccessoires)).up()
        .up();
    }

    if ((revenues.rentesAvs ?? 0) + (revenues.rentesLpp ?? 0) > 0) {
      const pensions = (revenues.rentesAvs ?? 0) + (revenues.rentesLpp ?? 0);
      revenue.ele("pension1Partner1")
        .ele("cantonalTax").txt(chf(pensions)).up()
        .ele("federalTax").txt(chf(pensions)).up()
        .up();
    }

    if ((revenues.rentes3ePilier ?? 0) > 0) {
      revenue.ele("pension2FPartner1")
        .ele("cantonalTax").txt(chf(revenues.rentes3ePilier)).up()
        .ele("federalTax").txt(chf(revenues.rentes3ePilier)).up()
        .up();
    }

    if ((revenues.revenusTitres ?? 0) > 0) {
      revenue.ele("securitiesRevenue")
        .ele("cantonalTax").txt(chf(revenues.revenusTitres)).up()
        .ele("federalTax").txt(chf(revenues.revenusTitres)).up()
        .up();
    }

    if ((revenues.revenusImmobiliers ?? 0) > 0) {
      revenue.ele("propertyRevenueRent")
        .ele("cantonalTax").txt(chf(revenues.revenusImmobiliers)).up()
        .ele("federalTax").txt(chf(revenues.revenusImmobiliers)).up()
        .up();
    }

    revenue.ele("totalAmountRevenue")
      .ele("cantonalTax").txt(chf(totalRevenuBrut)).up()
      .ele("federalTax").txt(chf(totalRevenuBrut)).up()
      .up();

    revenue.up();
  }

  // ── deduction ───────────────────────────────────────────────────────────────
  if (totalDeductions > 0) {
    const deduction = mainForm.ele("deduction");

    if (fraisProForfait > 0) {
      deduction.ele("jobExpensesPartner1")
        .ele("cantonalTax").txt(chf(fraisProForfait)).up()
        .ele("federalTax").txt(chf(fraisProForfait)).up()
        .up();
    }

    if ((deductions.interetsPassifs ?? 0) > 0) {
      deduction.ele("amountLiabilitiesInterest")
        .ele("cantonalTax").txt(chf(deductions.interetsPassifs)).up()
        .ele("federalTax").txt(chf(deductions.interetsPassifs)).up()
        .up();
    }

    if ((deductions.pilier3a ?? 0) + (deductions.rachatsLpp ?? 0) > 0) {
      const lpp = (deductions.pilier3a ?? 0) + (deductions.rachatsLpp ?? 0);
      deduction.ele("provision3aPartner1Deduction")
        .ele("cantonalTax").txt(chf(lpp)).up()
        .ele("federalTax").txt(chf(lpp)).up()
        .up();
    }

    if ((deductions.primesAssurance ?? 0) > 0) {
      deduction.ele("insuranceAndInterest")
        .ele("cantonalTax").txt(chf(deductions.primesAssurance)).up()
        .ele("federalTax").txt(chf(deductions.primesAssurance)).up()
        .up();
    }

    if ((deductions.fraisMedicaux ?? 0) > 0) {
      deduction.ele("diseaseAndAccidentExpensesDeduction")
        .ele("cantonalTax").txt(chf(deductions.fraisMedicaux)).up()
        .ele("federalTax").txt(chf(deductions.fraisMedicaux)).up()
        .up();
    }

    deduction.ele("totalAmountDeduction")
      .ele("cantonalTax").txt(chf(totalDeductions)).up()
      .ele("federalTax").txt(chf(totalDeductions)).up()
      .up();

    deduction.up();
  }

  // ── revenueCalculation ──────────────────────────────────────────────────────
  mainForm.ele("revenueCalculation")
    .ele("totalAmountNetRevenue")
      .ele("cantonalTax").txt(chf(revenuImposable)).up()
      .ele("federalTax").txt(chf(revenuImposable)).up()
      .up()
    .up();

  // ── asset ───────────────────────────────────────────────────────────────────
  if (fortuneBrute > 0 || dettes > 0) {
    const asset = mainForm.ele("asset");

    if ((assets.comptesBancaires ?? 0) > 0) {
      asset.ele("movablePropertySecuritiesAndAssets")
        .ele("cantonalTax").txt(chf(assets.comptesBancaires)).up()
        .ele("federalTax").txt(chf(assets.comptesBancaires)).up()
        .up();
    }

    if ((assets.immeublesValeurFiscale ?? 0) > 0) {
      asset.ele("propertyHouseOrFlat")
        .ele("cantonalTax").txt(chf(assets.immeublesValeurFiscale)).up()
        .ele("federalTax").txt(chf(assets.immeublesValeurFiscale)).up()
        .up();
    }

    asset
      .ele("totalAmountAssets")
        .ele("cantonalTax").txt(chf(fortuneBrute)).up()
        .ele("federalTax").txt(chf(fortuneBrute)).up()
        .up()
      .ele("totalAmountLiabilities")
        .ele("cantonalTax").txt(chf(dettes)).up()
        .ele("federalTax").txt(chf(dettes)).up()
        .up()
      .ele("resultingFiscalAssets")
        .ele("cantonalTax").txt(chf(fortuneNette)).up()
        .ele("federalTax").txt(chf(fortuneNette)).up()
        .up();

    asset.up();
  }

  mainForm.up();
  content.up();

  return doc.end({ prettyPrint: true });
}

// ─── Générateur PM (eCH-0229-ip, structure inspirée eCH-0119) ─────────────────

/**
 * Génère un XML de déclaration fiscale PM (personnes morales).
 *
 * Note: Le standard eCH-0229 pour PM n'est pas encore publié publiquement
 * avec XSD. Cette implémentation utilise une structure XML "best-effort"
 * inspirée du schéma eCH-0119, adaptée aux champs PM Lexa.
 * À mettre à jour lorsque eCH-0229 sera formellement publié.
 */
export function generateEch0119PmXml(input: Ech0119PmInput): string {
  const { year, canton, identity, financials, corrections, capital } = input;

  // Calcul bénéfice imposable
  const beneficeComptable = financials.benefitAccounting ?? 0;
  const totalCorrections =
    (corrections.chargesNonAdmises ?? 0) +
    (corrections.provisionsExcessives ?? 0) +
    (corrections.amortissementsExcessifs ?? 0) +
    (corrections.autresCorrections ?? 0);

  const beneficeImposable = Math.max(0, beneficeComptable + totalCorrections);

  const capitalTotal =
    (capital.capitalSocial ?? 0) +
    (capital.reservesLegales ?? 0) +
    (capital.reservesLibres ?? 0) +
    (capital.reportBenefice ?? 0);

  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("taxDeclarationPM", {
      "xmlns": "http://www.ech.ch/xmlns/eCH-0229/1",
      "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "xsi:schemaLocation": "http://www.ech.ch/xmlns/eCH-0229/1 eCH-0229-1-0.xsd",
    });

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.ele("header")
    .ele("taxPeriod").txt(String(year)).up()
    .ele("canton").txt(canton.toUpperCase()).up()
    .ele("source").txt("0").up()
    .ele("sourceDescription").txt("Lexa - Comptabilité IA Suisse").up()
    .up();

  // ── Identité société ─────────────────────────────────────────────────────────
  const company = doc.ele("legalEntityData");
  if (identity.legalName) company.ele("legalName").txt(identity.legalName);
  if (identity.legalForm) company.ele("legalForm").txt(identity.legalForm.toUpperCase());
  if (identity.ideNumber) company.ele("ideNumber").txt(identity.ideNumber);
  if (identity.siegeCommune) company.ele("siegeCommune").txt(identity.siegeCommune);
  company.up();

  // ── Bénéfice imposable ───────────────────────────────────────────────────────
  const benefit = doc.ele("benefitDeclaration");
  benefit.ele("beneficeComptable")
    .ele("cantonalTax").txt(chf(beneficeComptable)).up()
    .ele("federalTax").txt(chf(beneficeComptable)).up()
    .up();

  if (totalCorrections > 0) {
    benefit.ele("totalFiscalCorrections")
      .ele("chargesNonAdmises").txt(chf(corrections.chargesNonAdmises)).up()
      .ele("provisionsExcessives").txt(chf(corrections.provisionsExcessives)).up()
      .ele("amortissementsExcessifs").txt(chf(corrections.amortissementsExcessifs)).up()
      .up();
  }

  benefit.ele("beneficeImposable")
    .ele("cantonalTax").txt(chf(beneficeImposable)).up()
    .ele("federalTax").txt(chf(beneficeImposable)).up()
    .up();

  benefit.up();

  // ── Capital ──────────────────────────────────────────────────────────────────
  if (capitalTotal > 0) {
    doc.ele("capitalDeclaration")
      .ele("capitalSocial").txt(chf(capital.capitalSocial)).up()
      .ele("reservesLegales").txt(chf(capital.reservesLegales)).up()
      .ele("reservesLibres").txt(chf(capital.reservesLibres)).up()
      .ele("reportBenefice").txt(chf(capital.reportBenefice)).up()
      .ele("capitalImposable")
        .ele("cantonalTax").txt(chf(capitalTotal)).up()
        .ele("federalTax").txt(chf(capitalTotal)).up()
        .up()
      .up();
  }

  return doc.end({ prettyPrint: true });
}
