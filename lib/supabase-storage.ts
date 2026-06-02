import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BUCKET = 'cereri-concediu';

export async function uploadPDF(
  userId: string,
  requestId: string,
  pdfBuffer: Buffer
): Promise<string> {
  const path = `cereri/${userId}/${requestId}.pdf`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) throw new Error(`Upload PDF failed: ${error.message}`);

  return path;
}

export async function getSignedPDFUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error) throw new Error(`Signed URL failed: ${error.message}`);

  return data.signedUrl;
}