import { create } from "zustand";
import { REQUIRED_FIELD } from '../config/constants';
import { getERPSystem } from '../utils/envHelper';

const defaultTab = REQUIRED_FIELD[getERPSystem()]?.["Settings"]?.[0] || 'Reminder Settings';

export const useSettingsStore = create((set) => ({

    activeSettingsTab: defaultTab,
    setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),

    addRule: false,
    setAddRule: (val) => set({ addRule: val }),

}))