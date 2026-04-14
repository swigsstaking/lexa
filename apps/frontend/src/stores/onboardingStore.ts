import { create } from 'zustand';
import type { CreateCompanyInput } from '@/api/types';

type OnboardingDraft = Partial<CreateCompanyInput>;

interface OnboardingState {
  step: number;
  draft: OnboardingDraft;
  setStep: (n: number) => void;
  update: (patch: OnboardingDraft) => void;
  reset: () => void;
}

const initial: OnboardingDraft = {
  source: 'uid-register',
  country: 'CH',
  isVatSubject: false,
  vatDeclarationFrequency: 'quarterly',
  vatMethod: 'effective',
  fiscalYearStartMonth: 1,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  step: 0,
  draft: initial,
  setStep: (step) => set({ step }),
  update: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  reset: () => set({ step: 0, draft: initial }),
}));
