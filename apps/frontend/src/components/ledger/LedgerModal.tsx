import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Landmark, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { lexa, type TvaDecompteResponse } from '@/api/lexa';
import { LedgerPanel } from './LedgerPanel';

interface Props {
  open: boolean;
  onClose: () => void;
}

type PeriodKind = 'quarterly' | 'annual';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];
const QUARTERS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];

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

/**
 * Modal full-screen qui abrite le mode expert "Grand livre".
 * Toggle depuis Workspace via icône calc ou raccourci cmd+shift+L.
 */
export function LedgerModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [periodKind, setPeriodKind] = useState<PeriodKind>('quarterly');
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(
    (Math.ceil((new Date().getMonth() + 1) / 3) as 1 | 2 | 3 | 4) || 1,
  );
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [method, setMethod] = useState<'effective' | 'tdfn'>('effective');
  const [sectorCode, setSectorCode] = useState<string>('fiduciaire');
  const [generating, setGenerating] = useState(false);
  const [generatingVsPp, setGeneratingVsPp] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const tdfnRatesQuery = useQuery({
    queryKey: ['tdfn-rates'],
    queryFn: lexa.listTdfnRates,
    staleTime: Infinity,
    enabled: open && method === 'tdfn',
  });
  const tdfnRates = useMemo(
    () => tdfnRatesQuery.data?.rates ?? [],
    [tdfnRatesQuery.data],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleGenerateVsPp = async () => {
    setGeneratingVsPp(true);
    setToast(null);
    try {
      const result = await lexa.generateVsPpDeclaration({ year });
      const pdfBlob = base64ToBlob(result.pdf, 'application/pdf');
      downloadBlob(pdfBlob, `lexa-vs-pp-${year}.pdf`);
      const suffix = result.idempotent ? t('forms.tva_success_idempotent') : '';
      setToast({
        kind: 'success',
        text:
          t('forms.vspp_success', {
            year,
            streamId: result.streamId.slice(0, 8),
          }) + suffix,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error';
      setToast({ kind: 'error', text: `${t('forms.vspp_error')}: ${msg}` });
    } finally {
      setGeneratingVsPp(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setToast(null);
    try {
      const tdfnSector = method === 'tdfn' ? sectorCode : undefined;
      const result: TvaDecompteResponse =
        periodKind === 'quarterly'
          ? await lexa.generateTvaDecompte({
              quarter,
              year,
              method,
              sectorCode: tdfnSector,
            })
          : await lexa.generateTvaDecompteAnnual({
              year,
              method,
              sectorCode: tdfnSector,
            });

      const pdfBlob = base64ToBlob(result.pdf, 'application/pdf');
      const xmlBlob = new Blob([result.xml], { type: 'application/xml' });
      const base =
        periodKind === 'quarterly'
          ? `lexa-tva-Q${quarter}-${year}`
          : `lexa-tva-annuel-${year}`;
      downloadBlob(pdfBlob, `${base}.pdf`);
      downloadBlob(xmlBlob, `${base}.xml`);

      const successKey =
        periodKind === 'quarterly' ? 'forms.tva_success_quarterly' : 'forms.tva_success_annual';
      const suffix = result.idempotent ? t('forms.tva_success_idempotent') : '';
      setToast({
        kind: 'success',
        text:
          t(successKey, { quarter, year, streamId: result.streamId.slice(0, 8) }) + suffix,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error';
      setToast({ kind: 'error', text: `${t('forms.tva_error')}: ${msg}` });
    } finally {
      setGenerating(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40 bg-bg/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-4 md:inset-8 lg:inset-12 card-elevated overflow-hidden flex flex-col"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 py-3 border-b border-border flex-shrink-0 gap-2 sm:gap-4">
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-2xs uppercase tracking-wider text-muted">
                  Mode expert
                </span>
              </div>

              {/* Execution layer — génération décompte TVA */}
              <div className="flex items-center gap-2 flex-1 justify-start sm:justify-center flex-wrap">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span className="text-2xs uppercase tracking-wider text-muted hidden sm:inline">
                  {t('forms.tva_title')}
                </span>

                {/* Toggle trimestriel / annuel */}
                <div className="flex rounded-md border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPeriodKind('quarterly')}
                    disabled={generating}
                    className={`px-2 py-1 text-2xs transition-colors ${
                      periodKind === 'quarterly'
                        ? 'bg-accent text-accent-fg'
                        : 'bg-surface text-muted hover:bg-elevated'
                    }`}
                  >
                    {t('forms.tva_period_quarterly')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodKind('annual')}
                    disabled={generating}
                    className={`px-2 py-1 text-2xs transition-colors ${
                      periodKind === 'annual'
                        ? 'bg-accent text-accent-fg'
                        : 'bg-surface text-muted hover:bg-elevated'
                    }`}
                  >
                    {t('forms.tva_period_annual')}
                  </button>
                </div>

                {periodKind === 'quarterly' && (
                  <select
                    value={quarter}
                    onChange={(e) => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}
                    className="input !py-1 !text-xs !w-auto"
                    aria-label={t('forms.tva_quarter')}
                    disabled={generating}
                  >
                    {QUARTERS.map((q) => (
                      <option key={q} value={q}>
                        Q{q}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="input !py-1 !text-xs !w-auto"
                  aria-label={t('forms.tva_year')}
                  disabled={generating}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as 'effective' | 'tdfn')}
                  className="input !py-1 !text-xs !w-auto"
                  aria-label={t('forms.tva_method')}
                  disabled={generating}
                >
                  <option value="effective">{t('forms.tva_method_effective')}</option>
                  <option value="tdfn">{t('forms.tva_method_tdfn')}</option>
                </select>

                {method === 'tdfn' && (
                  <select
                    value={sectorCode}
                    onChange={(e) => setSectorCode(e.target.value)}
                    className="input !py-1 !text-xs !w-auto max-w-[180px]"
                    aria-label={t('forms.tva_sector')}
                    disabled={generating || tdfnRatesQuery.isLoading}
                  >
                    {tdfnRates.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label} · {r.rate}%
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={generating || generatingVsPp}
                  className="btn-primary !px-3 !py-1 !text-xs"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="hidden md:inline">{t('forms.tva_generating')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3" />
                      <span className="hidden md:inline">{t('forms.tva_cta')}</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleGenerateVsPp}
                  disabled={generating || generatingVsPp}
                  className="btn-secondary !px-3 !py-1 !text-xs"
                  title={`${t('forms.vspp_cta')} — ${year}`}
                >
                  {generatingVsPp ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="hidden md:inline">{t('forms.vspp_generating')}</span>
                    </>
                  ) : (
                    <>
                      <Landmark className="w-3 h-3" />
                      <span className="hidden md:inline">{t('forms.vspp_cta')}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-3 text-2xs text-muted flex-shrink-0">
                <kbd className="kbd">Esc</kbd>
                <button
                  onClick={onClose}
                  className="p-1 hover:text-ink transition-colors"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {toast && (
              <div
                className={`px-6 py-2 text-xs border-b ${
                  toast.kind === 'success'
                    ? 'bg-success/10 border-success/30 text-success'
                    : 'bg-danger/10 border-danger/30 text-danger'
                }`}
              >
                {toast.text}
              </div>
            )}

            <div className="flex-1 overflow-auto">
              <LedgerPanel />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
