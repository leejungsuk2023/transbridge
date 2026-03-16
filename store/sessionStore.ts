import { create } from "zustand";
import { SessionStatus, PatientLang, UserRole, PTTState } from "@/types";

interface SessionState {
  sessionId: string | null;
  status: SessionStatus;
  patientLang: PatientLang | null;
  role: UserRole | null;
  isConnected: boolean;
  staffPTTState: PTTState;
  patientPTTState: PTTState;
}

interface SessionActions {
  setSession: (id: string) => void;
  setStatus: (status: SessionStatus) => void;
  setPatientLang: (lang: PatientLang) => void;
  setRole: (role: UserRole) => void;
  setConnected: (connected: boolean) => void;
  setStaffPTTState: (state: PTTState) => void;
  setPatientPTTState: (state: PTTState) => void;
  reset: () => void;
}

const initialState: SessionState = {
  sessionId: null,
  status: "waiting",
  patientLang: null,
  role: null,
  isConnected: false,
  staffPTTState: "idle",
  patientPTTState: "idle",
};

export const useSessionStore = create<SessionState & SessionActions>((set) => ({
  ...initialState,

  setSession: (id) => set({ sessionId: id }),
  setStatus: (status) => set({ status }),
  setPatientLang: (lang) => set({ patientLang: lang }),
  setRole: (role) => set({ role }),
  setConnected: (connected) => set({ isConnected: connected }),
  setStaffPTTState: (state) => set({ staffPTTState: state }),
  setPatientPTTState: (state) => set({ patientPTTState: state }),
  reset: () => set(initialState),
}));
