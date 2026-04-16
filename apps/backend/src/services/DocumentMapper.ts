/**
 * DocumentMapper — Session 24, étendu BUG-P2-05.
 *
 * Mappe les champs OCR extraits d'un document vers les paths du wizard
 * (TaxpayerDraftState). Pure function, zéro side effect.
 *
 * Paths cibles (conformes au schéma taxpayers/schema.ts) :
 *   certificat_salaire → step1.firstName, step1.lastName,
 *                        step2.salaireBrut, step2.salaireNet*, step2.cotisationsSociales*
 *   attestation_3a     → step4.pilier3a    (= amount)
 *   facture / releve_bancaire / autre → mapping vide (V2)
 *
 * (*) step2.salaireNet et step2.cotisationsSociales : champs non standard V1 —
 *     mappés pour compatibilité future, ignorés par le wizard si absents du schéma.
 */

import type { DocumentType } from "./OcrExtractor.js";

export type FieldMapping = {
  /** Dot-path dans TaxpayerDraftState (ex: "step2.salaireBrut") */
  fieldPath: string;
  value: unknown;
};

/**
 * Retourne la liste des champs à écrire dans le draft à partir des champs
 * OCR extraits. Renvoie [] pour les types non mappables — pas d'erreur.
 */
export function mapDocumentToFields(doc: {
  type: DocumentType;
  extractedFields: Record<string, unknown>;
}): FieldMapping[] {
  switch (doc.type) {
    case "certificat_salaire": {
      const fields: FieldMapping[] = [];
      const ef = doc.extractedFields;

      // grossSalary → step2.salaireBrut
      if (typeof ef.grossSalary === "number" && ef.grossSalary > 0) {
        fields.push({ fieldPath: "step2.salaireBrut", value: ef.grossSalary });
      }
      // netSalary → step2.salaireNet (champ futur V2, ignoré si absent du schema)
      if (typeof ef.netSalary === "number" && ef.netSalary > 0) {
        fields.push({ fieldPath: "step2.salaireNet", value: ef.netSalary });
      }
      // deductionsAvsLpp → step2.cotisationsSociales (champ futur V2)
      if (typeof ef.deductionsAvsLpp === "number" && ef.deductionsAvsLpp > 0) {
        fields.push({ fieldPath: "step2.cotisationsSociales", value: ef.deductionsAvsLpp });
      }
      // employeeName → step1.firstName + step1.lastName (split sur premier espace)
      if (typeof ef.employeeName === "string" && ef.employeeName.trim()) {
        const trimmed = ef.employeeName.trim();
        const spaceIdx = trimmed.indexOf(" ");
        if (spaceIdx > 0) {
          fields.push({ fieldPath: "step1.firstName", value: trimmed.slice(0, spaceIdx) });
          fields.push({ fieldPath: "step1.lastName", value: trimmed.slice(spaceIdx + 1) });
        } else {
          // Nom unique sans prénom — on met tout dans lastName
          fields.push({ fieldPath: "step1.lastName", value: trimmed });
        }
      }

      return fields;
    }

    case "attestation_3a": {
      // amount → step4.pilier3a
      if (typeof doc.extractedFields.amount === "number" && doc.extractedFields.amount > 0) {
        return [{ fieldPath: "step4.pilier3a", value: doc.extractedFields.amount }];
      }
      return [];
    }

    // Pas de mapping wizard pour ces types en V1
    case "facture":
    case "releve_bancaire":
    case "autre":
    default:
      return [];
  }
}
