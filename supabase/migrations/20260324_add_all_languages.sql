ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_patient_lang_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_patient_lang_check CHECK (patient_lang IN ('th', 'vi', 'en', 'id', 'es', 'mn', 'yue', 'zh', 'ja', 'fr', 'de'));
