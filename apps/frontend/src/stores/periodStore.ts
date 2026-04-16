import { create } from 'zustand';
import { buildPresets, type PeriodRange } from '@/components/canvas/PeriodModal';

type PeriodState = {
  period: PeriodRange;
  modalOpen: boolean;
  setPeriod: (p: PeriodRange) => void;
  openModal: () => void;
  closeModal: () => void;
};

const currentYear = new Date().getFullYear();
const defaultPeriod = buildPresets(currentYear)[0];

export const usePeriodStore = create<PeriodState>((set) => ({
  period: defaultPeriod,
  modalOpen: false,
  setPeriod: (p) => set({ period: p }),
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
}));
