/**
 * Validates required environment variables at startup.
 * Call from API routes to detect misconfiguration early.
 */

interface EnvVar {
  name: string;
  required: boolean;
  clientSide?: boolean; // NEXT_PUBLIC_ prefix
}

const REQUIRED_VARS: EnvVar[] = [
  { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true, clientSide: true },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, clientSide: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
  { name: 'GEMINI_API_KEY', required: true },
];

export function validateEnv(): { valid: boolean; missing: string[] } {
  const missing = REQUIRED_VARS
    .filter(v => v.required && !process.env[v.name])
    .map(v => v.name);

  if (missing.length > 0) {
    console.error(`[ENV] Missing required environment variables: ${missing.join(', ')}`);
  }
  return { valid: missing.length === 0, missing };
}
