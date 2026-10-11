// Conturile instanței demo. Fără importuri: fișierul ajunge și în pagina de login.

export const DEMO_PASSWORD = "Demo2026!";
export const DEMO_ADMIN_USERNAME = "admin.demo";
export const DEMO_EMPLOYEE_USERNAME = "angajat.demo";

/** Conturile folosite de butoanele de pe pagina de login: nu li se poate schimba parola sau starea. */
export const DEMO_PROTECTED_USERNAMES = [DEMO_ADMIN_USERNAME, DEMO_EMPLOYEE_USERNAME];

export const DEMO_PROTECTED_MESSAGE =
  "Contul demo nu poate fi modificat, ca să rămână disponibil pentru toți vizitatorii.";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function isProtectedDemoAccount(username: string | null | undefined): boolean {
  return isDemoMode() && !!username && DEMO_PROTECTED_USERNAMES.includes(username.toLowerCase());
}
