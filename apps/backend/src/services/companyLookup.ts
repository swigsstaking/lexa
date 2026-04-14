import axios from "axios";
import { XMLParser } from "fast-xml-parser";

/**
 * Swiss Company Lookup — UID Register (BFS) SOAP API.
 *
 * Source: https://www.bfs.admin.ch/bfs/en/home/registers/enterprise-register/enterprise-identification/uid-register/uid-interfaces.html
 * Endpoint: https://www.uid-wse.admin.ch/V5.0/PublicServices.svc
 * Auth: none required — free public API
 *
 * Returns companies matching a name or UID, with legal form, address, VAT status.
 */

const UID_ENDPOINT = "https://www.uid-wse.admin.ch/V5.0/PublicServices.svc";

/**
 * Mapping empirique des codes legalForm retournés par l'API BFS UID V5.
 * Validé live contre /V5.0/PublicServices.svc le 2026-04-14 :
 *   0101 → Raison individuelle (Gianadda Pierre)
 *   0106 → SA (SWIGS SA, Nestlé SA, UBS AG)
 *   0107 → Sàrl (Kozelsky Sàrl)
 *   0108 → Coopérative (Migros-Genossenschafts-Bund)
 *   0109 → Association (Croix-Rouge suisse, Bauernverband)
 *   0110 → Fondation (Pierre Gianadda)
 *
 * Les codes non validés (SNC, société simple, KmdAG, succursale étrangère…)
 * tombent dans le fallback `autre` et déclenchent un warn côté backend pour
 * permettre d'enrichir le mapping après observation.
 */
const LEGAL_FORM_MAP: Record<string, string> = {
  "0101": "raison_individuelle",
  "0106": "sa",
  "0107": "sarl",
  "0108": "cooperative",
  "0109": "association",
  "0110": "fondation",
};

const LEGAL_FORM_LABEL: Record<string, string> = {
  raison_individuelle: "Raison individuelle",
  sa: "Société anonyme (SA)",
  sarl: "Société à responsabilité limitée (Sàrl)",
  cooperative: "Coopérative",
  association: "Association",
  fondation: "Fondation",
  autre: "Autre forme juridique",
};

const seenUnknownCodes = new Set<string>();

export type CompanyLookupResult = {
  uid: string; // CHE-XXX.XXX.XXX
  name: string;
  legalForm: string;
  legalFormCode: string;
  legalFormLabel: string;
  street: string;
  zip: string;
  city: string;
  canton: string | null;
  country: string;
  isVatSubject: boolean;
  vatStatus?: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function val(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string") return x.trim();
  if (typeof x === "number") return String(x);
  if (typeof x === "object" && "#text" in (x as object)) {
    const text = (x as { "#text": unknown })["#text"];
    return typeof text === "string" ? text.trim() : "";
  }
  return "";
}

function formatUid(rawUid: string): string {
  if (!rawUid) return "";
  const digits = rawUid.replace(/\D/g, "");
  if (digits.length !== 9) return rawUid;
  return `CHE-${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}`;
}

function buildSoapBody(name: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:uid="http://www.uid.admin.ch/xmlns/uid-wse"
  xmlns:uid5="http://www.uid.admin.ch/xmlns/uid-wse/5">
  <soap:Body>
    <uid:Search>
      <uid:searchParameters>
        <uid5:uidEntitySearchParameters>
          <uid5:organisationName>${escapeXml(name.trim())}</uid5:organisationName>
        </uid5:uidEntitySearchParameters>
      </uid:searchParameters>
    </uid:Search>
  </soap:Body>
</soap:Envelope>`;
}

export async function searchCompany(
  name: string,
  maxResults = 10,
): Promise<CompanyLookupResult[]> {
  if (!name || name.trim().length < 3) return [];

  const soapBody = buildSoapBody(name);

  let xml: string;
  try {
    const { data } = await axios.post<string>(UID_ENDPOINT, soapBody, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction:
          '"http://www.uid.admin.ch/xmlns/uid-wse/IPublicServices/Search"',
        "User-Agent": "Lexa/0.1 (Swiss SME Accounting)",
      },
      timeout: 15_000,
      responseType: "text",
    });
    xml = data;
  } catch (err) {
    const axErr = err as {
      response?: { status?: number; data?: string };
      message?: string;
    };
    throw new Error(
      `UID API request failed: ${axErr.response?.status ?? "network"} — ${axErr.message ?? "unknown"}`,
    );
  }

  const parsed = parser.parse(xml) as Record<string, unknown>;
  const envelope = parsed.Envelope as Record<string, unknown> | undefined;
  const body = envelope?.Body as Record<string, unknown> | undefined;
  const searchResponse = body?.SearchResponse as Record<string, unknown> | undefined;
  const searchResult = searchResponse?.SearchResult as Record<string, unknown> | undefined;
  const resultItems = searchResult?.uidEntitySearchResultItem;

  if (!resultItems) return [];

  const items: unknown[] = Array.isArray(resultItems) ? resultItems : [resultItems];

  return items
    .slice(0, maxResults)
    .map((rawItem) => parseItem(rawItem as Record<string, unknown>))
    .filter((c): c is CompanyLookupResult => c !== null);
}

function parseItem(item: Record<string, unknown>): CompanyLookupResult | null {
  try {
    const organisationWrapper = item.organisation as Record<string, unknown> | undefined;
    const organisation = (organisationWrapper?.organisation ?? organisationWrapper) as
      | Record<string, unknown>
      | undefined;
    if (!organisation) return null;

    const ident = organisation.organisationIdentification as
      | Record<string, unknown>
      | undefined;
    const uidObj = ident?.uid as Record<string, unknown> | undefined;
    const rawUid = val(uidObj?.uidOrganisationId);
    const uid = formatUid(rawUid);

    const name = val(ident?.organisationName);
    if (!name) return null;

    const legalFormCode = val(ident?.legalForm);
    const legalForm = LEGAL_FORM_MAP[legalFormCode] ?? "autre";
    if (legalForm === "autre" && legalFormCode && !seenUnknownCodes.has(legalFormCode)) {
      seenUnknownCodes.add(legalFormCode);
      console.warn(
        `[companyLookup] Unknown BFS legalForm code '${legalFormCode}' for ${val(ident?.organisationName)} — add to LEGAL_FORM_MAP`,
      );
    }
    const legalFormLabel = LEGAL_FORM_LABEL[legalForm] ?? legalForm;

    const address = organisation.address as Record<string, unknown> | undefined;
    const street = [val(address?.street), val(address?.houseNumber)]
      .filter(Boolean)
      .join(" ")
      .trim();

    const vat = (organisationWrapper?.vatRegisterInformation ??
      organisation.vatRegisterInformation) as Record<string, unknown> | undefined;
    const vatStatus = val(vat?.vatStatus);

    return {
      uid,
      name,
      legalForm,
      legalFormCode,
      legalFormLabel,
      street,
      zip: val(address?.swissZipCode),
      city: val(address?.town),
      canton: val(address?.cantonAbbreviation) || null,
      country: "CH",
      isVatSubject: vatStatus === "2",
      vatStatus: vatStatus || undefined,
    };
  } catch (err) {
    console.warn("Company lookup parse error:", (err as Error).message);
    return null;
  }
}
