/**
 * Numele aplicației și al companiei din mediul serverului (APP_NAME, COMPANY_NAME).
 * Se apelează doar din componente server: în browser variabilele nu există.
 */
export function getBrand() {
  return {
    appName: process.env.APP_NAME?.trim() || "Cereri Concediu",
    companyName: process.env.COMPANY_NAME?.trim() || null,
  };
}
