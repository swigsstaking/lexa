import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, FileText, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { lexa } from '@/api/lexa';
import { LedgerPanel } from './LedgerPanel';

interface Props {
  open: boolean;
  onClose: () => void;
}

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
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(
    (Math.ceil((new Date().getMonth() + 1) / 3) as 1 | 2 | 3 | 4) || 1,
  );
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [method, setMethod] = useState<'effective' | 'tdfn'>('effective');
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

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

  const handleGenerate = async () => {
    setGenerating(true);
    setToast(null);
    try {
      const result = await lexa.generateTvaDecompte({ quarter, year, method });
      const pdfBlob = base64ToBlob(result.pdf, 'application/pdf');
      const xmlBlob = new Blob([result.xml], { type: 'application/xml' });
      const base = `lexa-tva-Q${quarter}-${year}`;
      downloadBlob(pdfBlob, `${base}.pdf`);
      downloadBlob(xmlBlob, `${base}.xml`);
      setToast({
        kind: 'success',
        text: t('forms.tva_success', { quarter, year, streamId: result.streamId.slice(0, 8) }),
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
            <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0 gap-4">
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-2xs uppercase tracking-wider text-muted">
                  Mode expert
                </span>
              </div>

              {/* Execution layer — génération décompte TVA */}
              <div className="flex items-center gap-2 flex-1 justify-center">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span className="text-2xs uppercase tracking-wider text-muted hidden md:inline">
                  {t('forms.tva_title')}
                </span>
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
                <button
                  onClick={handleGenerate}
                  disabled={generating}
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
