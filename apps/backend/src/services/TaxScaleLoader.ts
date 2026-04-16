/**
 * Lexa — TaxScaleLoader
 * Session 33 — Intégration barèmes officiels ICC 2026
 *
 * Charge les YAML barèmes officiels depuis apps/backend/src/execution/baremes/
 * au premier appel et les cache en mémoire.
 * Expose getScale() + helpers de calcul progressif.
 */

import yaml from "js-yaml";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Types YAML ────────────────────────────────────────────────────────────────

export type Confidence = "high" | "medium" | "low";

export type Tranche = {
  threshold: number;
  threshold_max?: number;
  rate: number;
};

/** Structure PP — tarif VS (tarif_cantonal) */
type TarifCantonal = {
  structure: string;
  tranches: Tranche[];
};

/** Scale PP générique (GE / VD / FR utilisent tarif_single.tranches, VS tarif_cantonal.tranches) */
export type PpScale = {
  canton: string;
  year: number;
  entity: "PP";
  source: { confidence?: Confidence; authority?: string };
  /** VS : tarif_cantonal */
  tarif_cantonal?: TarifCantonal;
  /** GE / FR : tarif_single.tranches */
  tarif_single?: { structure?: string; tranches?: Tranche[] };
  /** VD : tarif_base */
  tarif_base?: { structure?: string; tranches?: Tranche[]; methode?: string; valeur_approx_2026?: number };
  tarif_married?: { source_confidence?: Confidence; tranches?: Tranche[] };
  frais_professionnels?: { pourcentage: number; min_chf: number; max_chf: number; confidence?: Confidence };
  coefficient_annuel?: { valeur_approx_2026?: number; confidence?: Confidence };
};

/** Structure impôt bénéfice PM */
type ImpotBeneficeEntry = {
  structure?: "flat" | "progressif_par_tranche" | string;
  rate?: number;
  tranches?: Tranche[];
  cantonal?: { structure?: string; tranches?: Tranche[]; rate?: number };
  communal?: { structure?: string; tranches?: Tranche[]; rate?: number };
};

/** Structure impôt capital PM */
type ImpotCapitalEntry = {
  cantonal?: { structure?: string; rate?: number; rate_permille?: number; tranches?: Tranche[] };
  standard?: { structure?: string; rate?: number; rate_permille?: number };
  sa_sarl_standard?: { rate_permille?: number; confidence?: Confidence };
  rate?: number;
  rate_permille?: number;
};

export type PmScale = {
  canton: string;
  year: number;
  entity: "PM";
  source: { confidence?: Confidence; authority?: string };
  impot_benefice: ImpotBeneficeEntry;
  impot_capital: ImpotCapitalEntry;
};

export type Scale = PpScale | PmScale;

// ── Loader ────────────────────────────────────────────────────────────────────

const BAREMES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "execution",
  "baremes",
);

const CACHE = new Map<string, Scale>();
let loaded = false;

function loadAll(): void {
  if (loaded) return;
  loaded = true;
  try {
    const files = readdirSync(BAREMES_DIR).filter((f) => f.endsWith(".yaml"));
    for (const file of files) {
      const raw = readFileSync(join(BAREMES_DIR, file), "utf8");
      const data = yaml.load(raw) as Scale;
      if (!data?.canton || !data?.entity || !data?.year) {
        console.warn(`[TaxScaleLoader] skipping ${file}: missing canton/entity/year`);
        continue;
      }
      const key = `${data.canton}-${data.entity}-${data.year}`;
      CACHE.set(key, data);
    }
    console.log(
      `[TaxScaleLoader] loaded ${CACHE.size} scales from ${BAREMES_DIR}`,
    );
  } catch (err) {
    console.warn(
      `[TaxScaleLoader] failed to load scales, fallback will be used: ${(err as Error).message}`,
    );
  }
}

/**
 * Retourne le barème pour un canton/entité/année, ou null si absent.
 * Filtre les scales "low" confidence (sauf si acceptLow=true).
 */
export function getScale(
  canton: string,
  entity: "PP" | "PM",
  year: number,
  acceptLow = false,
): Scale | null {
  loadAll();
  const scale = CACHE.get(`${canton}-${entity}-${year}`);
  if (!scale) return null;
  const conf = scale.source?.confidence;
  if (conf === "low" && !acceptLow) {
    console.info(
      `[TaxScaleLoader] scale ${canton}-${entity}-${year} has confidence=low, using fallback`,
    );
    return null;
  }
  return scale;
}

// ── Helpers PP ────────────────────────────────────────────────────────────────

/**
 * Extrait les tranches PP (taux marginal) selon la structure du YAML.
 * VS : tarif_cantonal.tranches (taux par seuil, pas tranches classiques)
 * GE : tarif_single.tranches (taux marginal par tranche)
 * FR : tarif_single.tranches
 * VD : tarif_base.tranches (quotient familial, coefficient annuel)
 */
export function getPpTranches(
  scale: PpScale,
  civilStatus: "single" | "married" = "single",
): Tranche[] | null {
  // Tarif marié si disponible et demandé
  if (
    civilStatus === "married" &&
    scale.tarif_married?.tranches &&
    scale.tarif_married.source_confidence !== "low"
  ) {
    return scale.tarif_married.tranches;
  }

  // VS
  if (scale.tarif_cantonal?.tranches?.length) {
    return scale.tarif_cantonal.tranches;
  }
  // GE / FR
  if (scale.tarif_single?.tranches?.length) {
    return scale.tarif_single.tranches;
  }
  // VD
  if (scale.tarif_base?.tranches?.length) {
    return scale.tarif_base.tranches;
  }
  return null;
}

/**
 * Calcul taux marginal applicable (dernier seuil <= revenu).
 * Les YAML PP ont des taux marginaux par seuil (pas des tranches classiques).
 * Retourne le taux (décimal) applicable au revenu donné.
 */
export function getMarginalRate(tranches: Tranche[], revenu: number): number {
  let rate = tranches[0]?.rate ?? 0;
  for (const t of tranches) {
    if (revenu >= t.threshold) {
      rate = t.rate;
    } else {
      break;
    }
  }
  return rate;
}

/**
 * Calcule l'ICC PP via barème officiel YAML (taux marginal × revenu).
 * VD : applique aussi le coefficient annuel.
 * Retourne null si barème non disponible ou confidence=low.
 */
export function calcIccPpFromScale(
  scale: PpScale,
  revenuImposable: number,
  civilStatus: "single" | "married" = "single",
): number | null {
  const tranches = getPpTranches(scale, civilStatus);
  if (!tranches || tranches.length === 0) return null;

  const rate = getMarginalRate(tranches, revenuImposable);

  // VD : multiplier par coefficient annuel
  let coeff = 1;
  if (scale.canton === "VD" && scale.coefficient_annuel) {
    const coeffConf = scale.coefficient_annuel.confidence;
    if (coeffConf !== "low" && scale.coefficient_annuel.valeur_approx_2026) {
      coeff = scale.coefficient_annuel.valeur_approx_2026;
    }
  }

  return Math.max(0, revenuImposable * rate * coeff);
}

// ── Helpers PM ────────────────────────────────────────────────────────────────

/**
 * Taux ICC PM sur bénéfice selon structure du YAML.
 * Gère flat + progressif + cantonal/communal combiné.
 * Retourne null si barème non disponible.
 */
export function calcIccPmBenefitFromScale(
  scale: PmScale,
  benefit: number,
): number | null {
  const ib = scale.impot_benefice;
  if (!ib) return null;

  // Structure directe flat (ex: GE 3.33%, FR 4%)
  if (ib.structure === "flat" && ib.rate !== undefined) {
    return Math.max(0, benefit * ib.rate);
  }

  // Structure progressive directe (ex: VD Art. 105)
  if (ib.structure === "progressif_par_tranche" && ib.tranches?.length) {
    return calcProgressiveTax(benefit, ib.tranches);
  }

  // VS : cantonal + communal séparés
  if (ib.cantonal && ib.communal) {
    const cantRate = getRateFromEntry(ib.cantonal, benefit);
    const commRate = getRateFromEntry(ib.communal, benefit);
    if (cantRate === null || commRate === null) return null;
    return Math.max(0, benefit * (cantRate + commRate));
  }

  // Fallback sur cantonal seul si communal absent
  if (ib.cantonal) {
    const cantRate = getRateFromEntry(ib.cantonal, benefit);
    if (cantRate === null) return null;
    return Math.max(0, benefit * cantRate);
  }

  return null;
}

/**
 * Taux impôt capital PM selon YAML.
 * Retourne null si barème non disponible.
 */
export function calcIccPmCapitalFromScale(
  scale: PmScale,
  capital: number,
): number | null {
  const ic = scale.impot_capital;
  if (!ic) return null;

  // VS : cantonal + communal
  if (ic.cantonal) {
    const cEntry = ic.cantonal;
    // Progressif
    if (cEntry.tranches?.length) {
      const cantTax = calcProgressiveTax(capital, cEntry.tranches);
      // Communal approximé à même niveau que cantonal (simplifié)
      return cantTax * 2;
    }
    // Permille direct
    if (cEntry.rate_permille !== undefined) {
      return Math.max(0, capital * (cEntry.rate_permille / 1000) * 2); // cantonal + communal
    }
    if (cEntry.rate !== undefined) {
      return Math.max(0, capital * cEntry.rate * 2);
    }
  }

  // Standard (GE permille, VD permille)
  if (ic.standard?.rate_permille !== undefined) {
    return Math.max(0, capital * (ic.standard.rate_permille / 1000));
  }
  if (ic.standard?.rate !== undefined) {
    return Math.max(0, capital * ic.standard.rate);
  }

  // FR : sa_sarl_standard
  if (ic.sa_sarl_standard?.rate_permille !== undefined) {
    const conf = ic.sa_sarl_standard.confidence;
    if (conf === "low") return null;
    return Math.max(0, capital * (ic.sa_sarl_standard.rate_permille / 1000));
  }

  return null;
}

// ── Utilitaires internes ──────────────────────────────────────────────────────

function getRateFromEntry(
  entry: { structure?: string; tranches?: Tranche[]; rate?: number },
  value: number,
): number | null {
  if (entry.structure === "progressif_par_tranche" && entry.tranches?.length) {
    // Pour PM progressif : on retourne le taux marginal (pas l'impôt total)
    return getMarginalRate(entry.tranches, value);
  }
  if (entry.rate !== undefined) return entry.rate;
  return null;
}

function calcProgressiveTax(value: number, tranches: Tranche[]): number {
  if (value <= 0) return 0;
  // VS PM : tranches par seuil → taux marginal × total (comme PP)
  const rate = getMarginalRate(tranches, value);
  return Math.max(0, value * rate);
}
