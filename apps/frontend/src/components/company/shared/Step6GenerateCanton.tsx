/**
 * Step6GenerateCanton — Step 6 générique pour 4 cantons PM (VS, GE, VD, FR)
 * Session 28 — remplace Step6GenerateVs hardcodé VS
 *
 * Différences vs Step6GenerateVs :
 *  - Prop canton : 'VS' | 'GE' | 'VD' | 'FR'
 *  - Utilise lexa.submitCompanyDraft(year, canton) au lieu de submitCompanyDraftVs
 *  - Labels autorité et disclaimer adaptés au canton
 */

import { useState } from 'react';
import { Download, FileText, Loader2, AlertTriangle } from 'lucide-react';
import type { CompanyDraftState } from '@/api/lexa';
import { lexa } from '@/api/lexa';
import type { PmCanton } from '@/routes/company/PmWizardCanton';

interface Props {
  state: CompanyDraftState;
  year: number;
  canton: PmCanton;
}

const CANTON_AUTHORITY: Record<PmCanton, string> = {
  VS: 'Service cantonal des contributions VS (SCC VS)',
  GE: 'Administration fiscale cantonale de Genève (AFC-GE)',
  VD: 'Administration cantonale des impôts VD (ACI VD)',
  FR: 'Service cantonal des contributions FR (SCC FR)',
};

const CANTON_LABEL: Record<PmCanton, string> = {
  VS: 'Valais',
  GE: 'Genève',
  VD: 'Vaud',
  FR: 'Fribourg',
};

function downloadPdf(base64: string, filename: string) {
  const byteChars = atob(base64);
  const byteNumbers = Array.from(byteChars).map((c) => c.charCodeAt(0));
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Step6GenerateCanton({ state, year, canton }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [taxTotal, setTaxTotal] = useState<number | null>(null);

  const s1 = state.step1 ?? {};

  const handleGenerate = async () => {
    setStatus('loading');
    setError(null);
    try {
      const result = await lexa.submitCompanyDraft(year, canton);
      const legalName = s1.legalName ?? 'declaration-pm';
      downloadPdf(
        result.pdfBase64,
        `declaration-pm-${canton.toLowerCase()}-${year}-${legalName.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      );
      setTaxTotal(result.taxEstimate.total);
      setStatus('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      setStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          Générer la déclaration PM {canton} {year}
        </h2>
        <p className="text-sm text-muted">
          Le PDF officiel Lexa sera généré et téléchargé automatiquement.
        </p>
      </div>

      <div className="card-elevated p-5 space-y-3">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-5 h-5 text-accent" />
          <span className="font-medium">
            Déclaration d'impôt PM — Canton {canton === 'VS' ? 'du Valais' : `de ${CANTON_LABEL[canton]}`}
          </span>
        </div>
        <div className="text-sm text-muted space-y-1">
          <p>Société : <span className="text-ink font-medium">{s1.legalName ?? '—'}</span></p>
          <p>Forme : <span className="text-ink">{s1.legalForm?.toUpperCase() ?? '—'}</span></p>
          <p>IDE : <span className="text-ink mono-num">{s1.ideNumber ?? '—'}</span></p>
          <p>Siège : <span className="text-ink">{s1.siegeCommune ?? '—'}</span></p>
          <p>Année : <span className="text-ink">{year}</span></p>
          <p>Autorité : <span className="text-ink">{CANTON_AUTHORITY[canton]}</span></p>
        </div>
      </div>

      {status === 'idle' && (
        <button
          onClick={() => void handleGenerate()}
          className="btn-primary w-full py-3 text-base"
        >
          <Download className="w-5 h-5" />
          Générer et télécharger le PDF
        </button>
      )}

      {status === 'loading' && (
        <button disabled className="btn-primary w-full py-3 text-base opacity-70">
          <Loader2 className="w-5 h-5 animate-spin" />
          Génération en cours…
        </button>
      )}

      {status === 'done' && (
        <div className="space-y-3">
          <div className="card bg-success/10 border-success/30 p-4 text-success">
            <div className="font-semibold mb-1">PDF téléchargé avec succès</div>
            {taxTotal !== null && (
              <p className="text-sm">
                Estimation fiscale totale :{' '}
                <span className="font-bold">
                  {taxTotal.toLocaleString('fr-CH', { maximumFractionDigits: 0 })} CHF
                </span>
              </p>
            )}
          </div>
          <button
            onClick={() => { setStatus('idle'); setTaxTotal(null); }}
            className="btn-secondary w-full"
          >
            Regénérer le PDF
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3">
          <div className="card bg-danger/10 border-danger/30 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-danger mb-1">Erreur de génération</div>
              <p className="text-sm text-muted">{error}</p>
            </div>
          </div>
          <button
            onClick={() => { setStatus('idle'); setError(null); }}
            className="btn-secondary w-full"
          >
            Réessayer
          </button>
        </div>
      )}

      <div className="card p-4 text-2xs text-muted">
        <p className="font-semibold mb-1">Disclaimer légal</p>
        <p>
          Ce PDF est généré à titre indicatif par Lexa. Il ne constitue pas une déclaration
          officielle transmise à {CANTON_AUTHORITY[canton]}. Vérifiez les
          montants avec votre fiduciaire avant tout dépôt officiel.
        </p>
      </div>
    </div>
  );
}
