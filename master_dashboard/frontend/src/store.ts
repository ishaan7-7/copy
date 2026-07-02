import { create } from 'zustand';

interface AppState {
  activeTab: number;
  autoRefresh: boolean;
  darkMode: boolean;
  selectedModule: string;
  selectedVehicle: string | null;
  setActiveTab: (tab: number) => void;
  toggleAutoRefresh: () => void;
  toggleDarkMode: () => void;
  setSelectedModule: (module: string) => void;
  setSelectedVehicle: (vehicleId: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  activeTab: 0,
  autoRefresh: true,
  darkMode: false,
  selectedModule: 'engine',
  selectedVehicle: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleAutoRefresh: () => set((state) => ({ autoRefresh: !state.autoRefresh })),
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
  setSelectedModule: (module) => set({ selectedModule: module }),
  setSelectedVehicle: (vehicleId) => set({ selectedVehicle: vehicleId }),
}));