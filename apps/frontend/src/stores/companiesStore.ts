import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Company } from '@/api/types';

interface CompaniesState {
  companies: Company[];
  activeCompanyId: string | null;
  addCompany: (c: Company) => void;
  removeCompany: (tenantId: string) => void;
  setActive: (tenantId: string | null) => void;
  updateCompany: (tenantId: string, patch: Partial<Company>) => void;
  clear: () => void;
}

export const useCompaniesStore = create<CompaniesState>()(
  persist(
    (set, get) => ({
      companies: [],
      activeCompanyId: null,
      addCompany: (company) => {
        const existing = get().companies.find((c) => c.tenantId === company.tenantId);
        if (existing) {
          set({
            companies: get().companies.map((c) =>
              c.tenantId === company.tenantId ? company : c
            ),
            activeCompanyId: company.tenantId,
          });
        } else {
          set({
            companies: [...get().companies, company],
            activeCompanyId: company.tenantId,
          });
        }
      },
      removeCompany: (tenantId) => {
        const remaining = get().companies.filter((c) => c.tenantId !== tenantId);
        set({
          companies: remaining,
          activeCompanyId:
            get().activeCompanyId === tenantId
              ? (remaining[0]?.tenantId ?? null)
              : get().activeCompanyId,
        });
      },
      setActive: (tenantId) => set({ activeCompanyId: tenantId }),
      updateCompany: (tenantId, patch) =>
        set({
          companies: get().companies.map((c) =>
            c.tenantId === tenantId ? { ...c, ...patch } : c
          ),
        }),
      clear: () => set({ companies: [], activeCompanyId: null }),
    }),
    { name: 'lexa.companies' }
  )
);

export const useActiveCompany = (): Company | null => {
  const companies = useCompaniesStore((s) => s.companies);
  const id = useCompaniesStore((s) => s.activeCompanyId);
  return id ? (companies.find((c) => c.tenantId === id) ?? null) : null;
};
