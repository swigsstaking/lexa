/**
 * DocumentMapper — Session 24.
 *
 * Mappe les champs OCR extraits d'un document vers les paths du wizard
 * (TaxpayerDraftState). Pure function, zéro side effect.
 *
 * Paths cibles (conformes au schéma taxpayers/schema.ts) :
 *   certificat_salaire → step2.salaireBrut (= grossSalary)
 *   attestation_3a     → step4.pilier3a    (= amount)
 *   facture / releve_bancaire / autre → mapping vide (V2)
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
      // grossSalary → step2.salaireBrut
      if (typeof doc.extractedFields.grossSalary === "number" && doc.extractedFields.grossSalary > 0) {
        fields.push({ fieldPath: "step2.salaireBrut", value: doc.extractedFields.grossSalary });
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
