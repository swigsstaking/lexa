/**
 * CitationVerifier — Service de vérification de citations légales (session 30)
 *
 * Pour chaque citation {law, article}, cherche dans Qdrant l'article correspondant
 * et retourne un résultat de vérification avec score et texte matché.
 *
 * Utilisé par l'Agent Audit pour valider l'intégrité des citations produites
 * par les autres agents (classifier, fiscal, tva, etc.)
 */

import { embedder } from "../rag/EmbedderClient.js";
import { qdrant } from "../rag/QdrantClient.js";

export type CitationInput = {
  law: string;
  article: string;
  rs?: string;
};

export type CitationVerificationResult = {
  citation: CitationInput;
  verified: boolean;
  matchedText?: string;
  matchedArticle?: string;
  score?: number;
  searchedQuery: string;
  note?: string;
};

/** Lois standards reconnues dans Qdrant */
const KNOWN_LAWS = new Set([
  "CO", "LIFD", "LHID", "LTVA", "LP", "CC", "CPC", "CPP",
  "LEFin", "LFINMA", "LB", "LAA", "LAVS", "LPP", "LPGA",
  "LIPM", "LIPP", "LITP",
]);

const NON_STANDARD_LAWS = new Set([
  "KÄFER", "KAEFER", "TREUHAND", "EXPERTSUISSE",
]);

/**
 * Vérifie une seule citation légale via Qdrant.
 */
export async function verifyCitation(
  citation: CitationInput,
): Promise<CitationVerificationResult> {
  const lawUpper = citation.law.toUpperCase().trim();
  const searchedQuery = `${citation.law} article ${citation.article}`;

  // Non-standard law (commentaires, doctrines, etc.) → non vérifiable
  if (NON_STANDARD_LAWS.has(lawUpper)) {
    return {
      citation,
      verified: false,
      searchedQuery,
      note: `Loi non-standard — non indexée dans Qdrant (source doctrinale)`,
    };
  }

  try {
    // 1. Embed la query
    const embedding = await embedder.embedOne(searchedQuery);

    // 2. Search Qdrant avec filtre sur la loi (si connue)
    let hits;
    if (KNOWN_LAWS.has(lawUpper)) {
      hits = await qdrant.search({
        vector: embedding,
        limit: 5,
        filter: {
          must: [{ key: "law", match: { value: citation.law } }],
        },
      });
    } else {
      // Loi inconnue → search sans filtre, réponse plus permissive
      hits = await qdrant.search({
        vector: embedding,
        limit: 5,
      });
    }

    if (hits.length === 0) {
      return {
        citation,
        verified: false,
        searchedQuery,
        note: KNOWN_LAWS.has(lawUpper)
          ? `Article ${citation.article} introuvable dans la base ${citation.law}`
          : `Loi "${citation.law}" non reconnue`,
      };
    }

    // 3. Cherche la correspondance exacte sur l'article
    const articleStr = String(citation.article).trim();
    const exactMatch = hits.find((h) => {
      const payloadArticle = String(h.payload.article ?? "").trim();
      const payloadArticleNum = String(h.payload.article_num ?? "").trim();
      return payloadArticle === articleStr || payloadArticleNum === articleStr;
    });

    if (exactMatch) {
      return {
        citation,
        verified: true,
        matchedText: exactMatch.payload.text?.slice(0, 300),
        matchedArticle: exactMatch.payload.article,
        score: exactMatch.score,
        searchedQuery,
      };
    }

    // 4. Match flou : score > 0.7, même loi → "probable mais non exact"
    const bestHit = hits[0];
    if (bestHit && bestHit.score > 0.7 && (
      (bestHit.payload.law ?? "").toUpperCase() === lawUpper
    )) {
      return {
        citation,
        verified: false,
        matchedText: bestHit.payload.text?.slice(0, 300),
        matchedArticle: bestHit.payload.article,
        score: bestHit.score,
        searchedQuery,
        note: `Article exact non trouvé — article proche: ${bestHit.payload.law} art.${bestHit.payload.article} (score ${bestHit.score.toFixed(3)})`,
      };
    }

    return {
      citation,
      verified: false,
      searchedQuery,
      note: `Aucune correspondance suffisante dans Qdrant (meilleur score: ${bestHit?.score.toFixed(3) ?? "N/A"})`,
    };
  } catch (err) {
    return {
      citation,
      verified: false,
      searchedQuery,
      note: `Erreur vérification: ${(err as Error).message}`,
    };
  }
}

/**
 * Vérifie une liste de citations en parallèle.
 */
export async function verifyCitations(
  citations: CitationInput[],
): Promise<CitationVerificationResult[]> {
  if (citations.length === 0) return [];

  // Limite à 20 citations par appel (évite saturation Qdrant)
  const limited = citations.slice(0, 20);
  return Promise.all(limited.map(verifyCitation));
}
