import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Company } from '@/api/types';

interface CompanyState {
  company: Company | null;
  setCompany: (c: Company | null) => void;
  clear: () => void;
}

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set) => ({
      company: null,
      setCompany: (company) => set({ company }),
      clear: () => set({ company: null }),
    }),
    { name: 'lexa.company' }
  )
);
