/**
 * PmWizardVs — Wizard déclaration PM (Personnes Morales) pour le canton du Valais
 * Session 27 — 6 steps dédié PM, hardcodé VS V1
 *
 * Pas de refactor générique PP/PM cette session — schéma PM trop différent.
 * Clone GE/VD/FR = sessions 28+.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { lexa, type CompanyDraft } from '@/api/lexa';
import { useActiveCompany } from '@/stores/companiesStore';
import { Step1IdentityVs } from '@/components/company/vs/Step1IdentityVs';
import { Step2FinancialsVs } from '@/components/company/vs/Step2FinancialsVs';
import { Step3CorrectionsVs } from '@/components/company/vs/Step3CorrectionsVs';
import { Step4CapitalVs } from '@/components/company/vs/Step4CapitalVs';
import { Step5PreviewVs } from '@/components/company/vs/Step5PreviewVs';
import { Step6GenerateVs } from '@/components/company/vs/Step6GenerateVs';
import { PmWizardSummaryVs } from '@/components/company/vs/PmWizardSummaryVs';

const STEPS = [
  { id: 1, label: 'Identité', icon: Building2 },
  { id: 2, label: 'Financiers', icon: Calculator },
  { id: 3, label: 'Corrections', icon: ChevronDown },
  { id: 4, label: 'Capital', icon: Calculator },
  { id: 5, label: 'Aperçu', icon: FileText },
  { id: 6, label: 'Générer', icon: Sparkles },
] as const;

const CANTON = 'VS';
const DEBOUNCE_MS = 500;

export function PmWizardVs() {
  const params = useParams<{ year?: string }>();
  const year = Number(params.year) || new Date().getFullYear();
  const navigate = useNavigate();
  const activeCompany = useActiveCompany();

  const [draft, setDraft] = useState<CompanyDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [exitConfirm, setExitConfirm] = useState(false);

  // Debounce map pour auto-save
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Valeurs pendantes (non encore flushées) — utilisé pour le flush au unmount
  const pendingPatches = useRef<Map<string, unknown>>(new Map());

  // Charger ou créer le draft au montage
  useEffect(() => {
    void loadOrCreateDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // Flush les patches debounce en attente au unmount (évite perte de données si rechargement rapide)
  useEffect(() => {
    return () => {
      debounceTimers.current.forEach((timer) => clearTimeout(timer));
      debounceTimers.current.clear();
      // Envoi groupé des valeurs pendantes
      pendingPatches.current.forEach((value, path) => {
        void lexa.patchCompanyDraft(year, CANTON, path, value).catch(() => {});
      });
      pendingPatches.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOrCreateDraft() {
    setLoading(true);
    setError(null);
    try {
      const d = await lexa.getCompanyDraft(year, CANTON);
      setDraft(d);
    } catch {
      // Draft absent → en créer un vide avec un legalName placeholder
      try {
        const legalName = activeCompany?.name ?? 'Société';
        const { id } = await lexa.createCompanyDraft(year, CANTON, legalName);
        const d = await lexa.getCompanyDraft(year, CANTON);
        setDraft(d);
        void id; // utilisé ci-dessus
      } catch (err2) {
        setError(err2 instanceof Error ? err2.message : 'Impossible de créer le brouillon PM');
      }
    }
    setLoading(false);
  }

  // Auto-save debounced
  const handlePatch = useCallback((path: string, value: unknown) => {
    if (!draft) return;

    // Optimistic update local
    const keys = path.split('.');
    setDraft((prev) => {
      if (!prev) return prev;
      const newState = JSON.parse(JSON.stringify(prev.state)) as typeof prev.state;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cursor: any = newState;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!cursor[keys[i]] || typeof cursor[keys[i]] !== 'object') {
          cursor[keys[i]] = {};
        }
        cursor = cursor[keys[i]];
      }
      cursor[keys[keys.length - 1]] = value;
      return { ...prev, state: newState };
    });

    // Debounce la requête réseau
    pendingPatches.current.set(path, value);
    const existing = debounceTimers.current.get(path);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      void lexa.patchCompanyDraft(year, CANTON, path, value).catch((err) => {
        console.warn('[PmWizardVs] patch failed:', err);
      });
      debounceTimers.current.delete(path);
      pendingPatches.current.delete(path);
    }, DEBOUNCE_MS);
    debounceTimers.current.set(path, timer);
  }, [draft, year]);

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
          <p className="text-danger mb-4">{error ?? 'Impossible de charger le brouillon PM'}</p>
          <button onClick={() => void loadOrCreateDraft()} className="btn-secondary">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const handleNext = () => { if (currentStep < STEPS.length) setCurrentStep((s) => s + 1); };
  const handlePrev = () => { if (currentStep > 1) setCurrentStep((s) => s - 1); };

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
            Déclaration PM — Canton du Valais — {year}
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
            const isDone = currentStep > s.id;
            return (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => setCurrentStep(s.id)}
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
                  <div className={`flex-1 h-px ${isDone ? 'bg-success/40' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 pb-48 lg:pb-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="lg:col-span-2 space-y-6"
          >
            {currentStep === 1 && (
              <Step1IdentityVs state={draft.state} onPatch={handlePatch} />
            )}
            {currentStep === 2 && (
              <Step2FinancialsVs state={draft.state} onPatch={handlePatch} />
            )}
            {currentStep === 3 && (
              <Step3CorrectionsVs state={draft.state} onPatch={handlePatch} />
            )}
            {currentStep === 4 && (
              <Step4CapitalVs state={draft.state} onPatch={handlePatch} />
            )}
            {currentStep === 5 && (
              <Step5PreviewVs state={draft.state} year={year} />
            )}
            {currentStep === 6 && (
              <Step6GenerateVs state={draft.state} year={year} />
            )}

            {/* Nav buttons (cachés sur step 6) */}
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

          {/* Side-panel summary — sticky bottom mobile, side panel desktop */}
          <aside className="lg:col-span-1 fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto bg-surface/95 lg:bg-transparent backdrop-blur-sm lg:backdrop-blur-none border-t lg:border-t-0 border-border p-4 lg:p-0 max-h-[40vh] lg:max-h-none overflow-y-auto z-10 lg:z-auto">
            <PmWizardSummaryVs draft={draft} />
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
            <h3 className="font-semibold mb-2">Quitter le brouillon PM ?</h3>
            <p className="text-sm text-muted mb-4">
              Votre saisie est automatiquement enregistrée. Vous pourrez reprendre plus tard.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setExitConfirm(false)} className="btn-secondary">
                Rester
              </button>
              <button
                onClick={() => navigate('/workspace')}
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
