import { useState } from 'react';
import { Download, Loader2, Sparkles, FileCheck } from 'lucide-react';
import type { TaxpayerDraft } from '@/api/lexa';
import { lexa } from '@/api/lexa';

interface Props {
  draft: TaxpayerDraft;
  year: number;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Step6GenerateGe({ draft, year }: Props) {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    streamId: string;
    idempotent: boolean;
    revenuImposable: number;
    fortuneNette: number;
    source: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fullName =
    `${draft.state.step1.firstName ?? ''} ${draft.state.step1.lastName ?? ''}`.trim() ||
    'contribuable';

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      // Auto-save profil (transparent, sans bloquer la génération)
      const s1 = draft.state.step1;
      lexa.patchTaxpayerProfile({
        firstName: s1.firstName,
        lastName: s1.lastName,
        birthDate: s1.dateOfBirth,
        civilStatus: s1.civilStatus,
        commune: s1.commune,
        canton: 'GE',
        childrenCount: s1.childrenCount,
      }).catch(() => { /* non-bloquant */ });

      const response = await lexa.submitTaxpayerDraftGe({ fiscalYear: year });
      const pdfBlob = base64ToBlob(response.pdf, 'application/pdf');
      const filename = `lexa-declaration-pp-ge-${year}-${fullName.replace(/\s+/g, '_')}.pdf`;
      downloadBlob(pdfBlob, filename);
      setResult({
        streamId: response.streamId,
        idempotent: response.idempotent,
        revenuImposable: response.form.projection.revenuImposable,
        fortuneNette: response.form.projection.fortuneNette,
        // @ts-expect-error — source est ajoutée en session 15
        source: response.form.projection.source ?? 'draft',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          Générer ma déclaration Genève
        </h2>
        <p className="text-sm text-muted">
          Le PDF sera produit à partir de toutes les données saisies, puis
          téléchargé automatiquement. Lexa prépare, vous validez et signez.
        </p>
      </div>

      {!result ? (
        <div className="card-elevated p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent grid place-items-center mx-auto mb-5">
            <Sparkles className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            Prêt·e à générer votre déclaration GE {year} ?
          </h3>
          <p className="text-sm text-muted max-w-md mx-auto mb-6">
            Le PDF inclura toutes les informations saisies, les calculs de revenu
            imposable, et le disclaimer réglementaire obligatoire (LIFD art. 33,
            LIPP RSG D 3 08).
          </p>
          {error && (
            <div className="p-3 mb-4 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">
              {error}
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary text-base px-6 py-3"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Générer ma déclaration PDF Genève
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="card-elevated p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-success/10 text-success grid place-items-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">Déclaration GE générée ✓</h3>
              <p className="text-2xs text-muted">
                Event audit : {result.streamId.slice(0, 8)}
                {result.idempotent && ' (idempotent)'} · source : {result.source}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-elevated border border-border">
              <div className="text-2xs uppercase tracking-wider text-muted mb-1">
                Revenu imposable
              </div>
              <div className="text-2xl mono-num text-ink">
                {result.revenuImposable.toLocaleString('fr-CH', {
                  minimumFractionDigits: 0,
                })}{' '}
                CHF
              </div>
            </div>
            <div className="p-4 rounded-lg bg-elevated border border-border">
              <div className="text-2xs uppercase tracking-wider text-muted mb-1">
                Fortune nette
              </div>
              <div className="text-2xl mono-num text-ink">
                {result.fortuneNette.toLocaleString('fr-CH', {
                  minimumFractionDigits: 0,
                })}{' '}
                CHF
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs text-warning">
            Rappel : Lexa prépare cette déclaration à titre indicatif. Faites-la
            vérifier par votre fiduciaire ou l'Administration fiscale cantonale
            de Genève (AFC-GE) avant dépôt. Base légale : LIFD art. 33,
            LIPP (RSG D 3 08).
          </div>

          <button
            onClick={() => setResult(null)}
            className="btn-ghost mt-4 text-xs"
          >
            Regénérer
          </button>
        </div>
      )}
    </div>
  );
}
