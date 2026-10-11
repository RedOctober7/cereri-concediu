import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'cereri-concediu';
/** O cerere spre Storage care nu răspunde nu trebuie să țină pe loc ruta care o face. */
const REQUEST_TIMEOUT_MS = 15_000;

/** NEXT_PUBLIC_SUPABASE_URL sau SUPABASE_SERVICE_ROLE_KEY lipsește: PDF-urile nu se stochează. */
export class StorageNotConfiguredError extends Error {
  constructor() {
    super('Supabase Storage nu este configurat (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    this.name = 'StorageNotConfiguredError';
  }
}

// Clientul se creează la prima folosire, nu la importul modulului: fără variabilele
// Supabase aplicația pornește, iar funcțiile de mai jos aruncă StorageNotConfiguredError
// (apelanții tratează deja eșecul stocării ca pe o eroare netratată fatal).
let client: SupabaseClient | null = null;
let missingConfigWarned = false;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

function getClient(): SupabaseClient {
  if (client) {
    return client;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    if (!missingConfigWarned) {
      missingConfigWarned = true;
      console.warn(
        '[Storage] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY lipsesc: PDF-urile nu se stochează.'
      );
    }
    throw new StorageNotConfiguredError();
  }
  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout },
  });
  return client;
}

export async function uploadPDF(
  userId: string,
  requestId: string,
  pdfBuffer: Buffer
): Promise<string> {
  const path = `cereri/${userId}/${requestId}.pdf`;

  const { error } = await getClient()
    .storage.from(BUCKET)
    .upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) throw new Error(`Upload PDF failed: ${error.message}`);

  return path;
}

export async function getSignedPDFUrl(path: string): Promise<string> {
  const { data, error } = await getClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error) throw new Error(`Signed URL failed: ${error.message}`);

  return data.signedUrl;
}
