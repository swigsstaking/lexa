import { create } from 'zustand';
import { lexa, type TaxpayerDraft } from '@/api/lexa';

type TaxpayerDraftState = {
  draft: TaxpayerDraft | null;
  currentStep: number;
  loading: boolean;
  error: string | null;
  pendingPatches: Map<string, ReturnType<typeof setTimeout>>;
  fetch: (year: number) => Promise<void>;
  setStep: (step: number) => void;
  updateField: (field: string, value: unknown, step: number, fiscalYear: number) => void;
  reset: () => void;
};

const DEBOUNCE_MS = 500;

export const useTaxpayerDraftStore = create<TaxpayerDraftState>()((set, get) => ({
  draft: null,
  currentStep: 1,
  loading: false,
  error: null,
  pendingPatches: new Map(),

  fetch: async (year) => {
    set({ loading: true, error: null });
    try {
      const { draft } = await lexa.getTaxpayerDraft(year);
      set({ draft, currentStep: draft.currentStep, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'fetch failed',
        loading: false,
      });
    }
  },

  setStep: (step) => set({ currentStep: step }),

  // Optimistic update + debounced PATCH to avoid spamming the backend
  updateField: (field, value, step, fiscalYear) => {
    const { draft, pendingPatches } = get();
    if (!draft) return;

    // Apply optimistic mutation on the local state
    const nextState = structuredClone(draft.state) as Record<string, unknown>;
    const parts = field.split('.');
    let cursor: Record<string, unknown> = nextState;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!;
      const child = cursor[key];
      if (typeof child !== 'object' || child === null) {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]!] = value;

    set({
      draft: { ...draft, state: nextState as TaxpayerDraft['state'] },
    });

    // Debounce the actual PATCH
    const existing = pendingPatches.get(field);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      try {
        const { draft: updated } = await lexa.patchTaxpayerField({
          fiscalYear,
          step,
          field,
          value,
        });
        set({ draft: updated });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'patch failed',
        });
      } finally {
        pendingPatches.delete(field);
      }
    }, DEBOUNCE_MS);

    pendingPatches.set(field, timer);
  },

  reset: () => set({ draft: null, currentStep: 1, error: null }),
}));
