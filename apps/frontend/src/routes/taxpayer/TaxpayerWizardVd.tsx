import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Landmark,
  Loader2,
  Sparkles,
  Users,
  Wallet,
  Receipt,
  X,
} from 'lucide-react';
import { useTaxpayerDraftStore } from '@/stores/taxpayerDraftStore';
import { lexa } from '@/api/lexa';
import { Step1IdentityVd } from '@/components/taxpayer/vd/Step1IdentityVd';
import { Step2RevenuesVd } from '@/components/taxpayer/vd/Step2RevenuesVd';
import { Step3WealthVd } from '@/components/taxpayer/vd/Step3WealthVd';
import { Step4DeductionsVd } from '@/components/taxpayer/vd/Step4DeductionsVd';
import { Step5PreviewVd } from '@/components/taxpayer/vd/Step5PreviewVd';
import { Step6GenerateVd } from '@/components/taxpayer/vd/Step6GenerateVd';
import { WizardSummaryVd } from '@/components/taxpayer/vd/WizardSummaryVd';

const STEPS = [
  { id: 1, label: 'Identité', icon: Users },
  { id: 2, label: 'Revenus', icon: Wallet },
  { id: 3, label: 'Fortune', icon: Landmark },
  { id: 4, label: 'Déductions', icon: Receipt },
  { id: 5, label: 'Aperçu', icon: FileText },
  { id: 6, label: 'Générer', icon: Sparkles },
] as const;

export function TaxpayerWizardVd() {
  const params = useParams<{ year?: string }>();
  const year = Number(params.year) || new Date().getFullYear();
  const navigate = useNavigate();
  const { draft, currentStep, loading, error, fetch, setStep } = useTaxpayerDraftStore();
  const [exitConfirm, setExitConfirm] = useState(false);

  useEffect(() => {
    void fetch(year);
  }, [fetch, year]);

  const handleNext = () => {
    if (currentStep < STEPS.length) setStep(currentStep + 1);
  };
  const handlePrev = () => {
    if (currentStep > 1) setStep(currentStep - 1);
  };

  if (loading && !draft) {
    return (
      <div className="min-h-screen grid place-items-center text-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (error || !draft) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="card p-6 max-w-md text-center">
          <p className="text-danger mb-4">{error ?? 'Impossible de charger le brouillon'}</p>
          <button onClick={() => void fetch(year)} className="btn-secondary">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border bg-surface flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-accent text-accent-fg grid place-items-center font-semibold text-xs">
            L
          </div>
          <span className="text-sm font-semibold">Lexa</span>
          <span className="w-px h-5 bg-border" />
          <span className="text-sm text-muted">
            Déclaration d'impôt PP Vaud — {year}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xs text-subtle">
            Brouillon · enregistré auto
          </span>
          <button
            onClick={() => setExitConfirm(true)}
            className="btn-ghost !px-2 !py-1.5"
            aria-label="Quitter"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Stepper */}
      <div className="border-b border-border bg-surface/40 px-6 py-4 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = currentStep === s.id;
            const isDone = draft.currentStep > s.id;
            return (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                    isActive
                      ? 'bg-accent text-accent-fg'
                      : isDone
                        ? 'bg-success/10 text-success hover:bg-success/20'
                        : 'bg-elevated text-muted hover:text-ink'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{s.label}</span>
                  <span className="md:hidden">{s.id}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px ${
                      isDone ? 'bg-success/40' : 'bg-border'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="lg:col-span-2 space-y-6"
          >
            {currentStep === 1 && <Step1IdentityVd draft={draft} year={year} />}
            {currentStep === 2 && <Step2RevenuesVd draft={draft} year={year} />}
            {currentStep === 3 && <Step3WealthVd draft={draft} year={year} />}
            {currentStep === 4 && <Step4DeductionsVd draft={draft} year={year} />}
            {currentStep === 5 && <Step5PreviewVd draft={draft} year={year} />}
            {currentStep === 6 && <Step6GenerateVd draft={draft} year={year} />}

            {/* Nav buttons (cachés sur step 6 qui a son propre CTA) */}
            {currentStep < 6 && (
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  onClick={handlePrev}
                  disabled={currentStep === 1}
                  className="btn-secondary"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Précédent
                </button>
                <button onClick={handleNext} className="btn-primary">
                  Suivant
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>

          {/* Side-panel summary */}
          <aside className="lg:col-span-1">
            <WizardSummaryVd draft={draft} />
          </aside>
        </div>
      </main>

      {/* Exit confirm */}
      {exitConfirm && (
        <div
          className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm grid place-items-center"
          onClick={() => setExitConfirm(false)}
        >
          <div
            className="card-elevated p-6 max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-2">Quitter le brouillon ?</h3>
            <p className="text-sm text-muted mb-4">
              Votre saisie est automatiquement enregistrée. Vous pourrez reprendre plus tard.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setExitConfirm(false)}
                className="btn-secondary"
              >
                Rester
              </button>
              <button
                onClick={async () => {
                  await new Promise((r) => setTimeout(r, 600));
                  navigate('/workspace');
                }}
                className="btn-primary"
              >
                <Check className="w-4 h-4" />
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper pour les steps VD 1-4 — expose le helper d'update
export function useFieldUpdaterVd(year: number) {
  const updateField = useTaxpayerDraftStore((s) => s.updateField);
  return (field: string, value: unknown, step: number) =>
    updateField(field, value, step, year);
}

// Re-export du helper API pour que Step6Vd puisse call submit-vd
export { lexa };
