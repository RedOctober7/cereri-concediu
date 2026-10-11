import path from 'node:path';
import { Font } from '@react-pdf/renderer';

/**
 * Fonturile standard PDF (Times-Roman, Helvetica) nu au ă, ș, ț, î, â. Noto Sans
 * (licență SIL OFL 1.1, vezi lib/pdf/fonts/OFL.txt) acoperă complet româna.
 *
 * Fișierele se citesc de pe disc la randare, relativ la rădăcina proiectului
 * (process.cwd(), la fel local și pe Vercel). Rutele care generează PDF-uri le
 * includ în bundle prin `outputFileTracingIncludes` din next.config.ts.
 */
export const PDF_FONT_FAMILY = 'Noto Sans';

const FONTS_DIR = path.join(process.cwd(), 'lib', 'pdf', 'fonts');

let registered = false;

export function registerPdfFonts() {
  if (registered) {
    return;
  }
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: path.join(FONTS_DIR, 'NotoSans-Regular.ttf'), fontWeight: 400 },
      { src: path.join(FONTS_DIR, 'NotoSans-Bold.ttf'), fontWeight: 700 },
    ],
  });
  // Despărțirea în silabe a react-pdf este pentru engleză („concedi-ului”):
  // cuvintele românești trec întregi pe rândul următor.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
