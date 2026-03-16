import { create } from "zustand";
import { TranslationMessage } from "@/types";

interface TranscriptState {
  messages: TranslationMessage[];
}

interface TranscriptActions {
  addMessage: (message: TranslationMessage) => void;
  clearMessages: () => void;
}

export const useTranscriptStore = create<TranscriptState & TranscriptActions>(
  (set) => ({
    messages: [],

    addMessage: (message) =>
      set((state) => ({ messages: [...state.messages, message] })),

    clearMessages: () => set({ messages: [] }),
  })
);
