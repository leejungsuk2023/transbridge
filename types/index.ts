export type SessionStatus = 'waiting' | 'active' | 'ended';
export type PatientLang = 'th' | 'vi' | 'en' | 'id';
export type UserRole = 'staff' | 'patient';

// v2 types
export type SpeakerRole = 'staff' | 'patient';
export type PTTState = 'idle' | 'recording' | 'processing' | 'playing';

export interface TranslateRequest {
  audioData: string; // base64 audio
  sourceLang: 'ko' | 'th' | 'vi';
  targetLang: 'ko' | 'th' | 'vi';
  speaker: SpeakerRole;
  sessionId: string;
}

export interface TranslateResponse {
  success: boolean;
  data?: {
    originalText: string;
    translatedText: string;
    audioData: string; // base64 MP3
    glossaryTerms: string[]; // matched glossary terms in translatedText
    processingTimeMs: number;
  };
  error?: string;
}

export interface Session {
  id: string;
  hospitalId: string;
  patientLang: PatientLang | null;
  status: SessionStatus;
  startedAt: Date;
  endedAt?: Date;
  durationSec?: number;
}

export interface Hospital {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'basic' | 'premium';
  createdAt: Date;
}

export interface TranslationMessage {
  id: string;
  sessionId: string;
  speaker: UserRole;
  originalText: string;
  translatedText: string;
  audioData?: string; // base64
  timestamp: Date;
}

export interface GlossaryEntry {
  id: string;
  ko: string;
  th: string;
  vi: string;
  category: string;
}
