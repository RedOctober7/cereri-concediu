// Ajutoare pentru formularele din paginile de administrare: numere scrise în format
// românesc, erori zod pe câmpuri, apeluri API cu mesajul de eroare al serverului.

/**
 * „12,5”, „12.5”, „-2” → număr; text gol sau invalid → NaN (zod îl respinge cu
 * mesajul câmpului). Acceptă virgula ca separator zecimal, ca în restul aplicației.
 */
export function parseDecimal(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "" || !/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) {
    return Number.NaN;
  }
  return Number(normalized);
}

/** Număr → text pentru un câmp editabil, cu virgulă zecimală: 12.5 → „12,5”. */
export function decimalToInput(value: number): string {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

type Issue = { path: PropertyKey[]; message: string };

/** Primul mesaj de eroare pentru fiecare câmp de pe primul nivel. */
export function fieldErrorsFrom(issues: readonly Issue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

export type ApiResult<T> =
  | { ok: true; data: T; warning?: string }
  | { ok: false; error: string; field?: string; status: number };

const NETWORK_ERROR =
  "Nu s-a putut contacta serverul. Verifică conexiunea și încearcă din nou.";
const SERVER_ERROR = "A apărut o eroare. Reîncearcă în câteva momente.";

/**
 * fetch + JSON pentru rutele /api/admin: erorile au forma { error: string }, iar un
 * răspuns care nu e JSON (ex. o pagină de eroare a platformei) devine un mesaj generic.
 */
export const UNEXPECTED_RESPONSE_ERROR =
  "Serverul a răspuns neașteptat. Reîncarcă pagina; dacă problema continuă, deconectează-te și autentifică-te din nou.";

export async function apiRequest<T = unknown>(
  url: string,
  init: { method: string; body?: unknown }
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR, status: 0 };
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // Răspuns gol sau HTML: rămâne mesajul generic de mai jos.
  }

  if (!response.ok) {
    return {
      ok: false,
      error: typeof payload.error === "string" ? payload.error : SERVER_ERROR,
      field: typeof payload.field === "string" ? payload.field : undefined,
      status: response.status,
    };
  }

  // Un răspuns „reușit” fără JSON (de ex. o redirecționare spre o pagină, când sesiunea
  // a expirat sau parola trebuie schimbată) nu e un succes: altfel apelantul ar folosi
  // `data` nedefinit.
  if (response.redirected || !("data" in payload)) {
    return { ok: false, error: UNEXPECTED_RESPONSE_ERROR, status: response.status };
  }

  return {
    ok: true,
    data: payload.data as T,
    warning: typeof payload.warning === "string" ? payload.warning : undefined,
  };
}

const PASSWORD_ALPHABETS = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnopqrstuvwxyz",
  digits: "23456789",
};

function randomIndex(max: number): number {
  const buffer = new Uint32Array(1);
  // Respingem valorile din coada intervalului, ca toate caracterele să fie la fel de probabile.
  const limit = Math.floor(0x100000000 / max) * max;
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

/**
 * Parolă temporară de 14 caractere care respectă regulile din validators.ts (literă
 * mare, cifră, minim 10). Fără caractere ușor de confundat (0/O, 1/l/I) fiindcă
 * adminul o dictează sau o scrie angajatului.
 */
export function generatePassword(length = 14): string {
  const all = PASSWORD_ALPHABETS.upper + PASSWORD_ALPHABETS.lower + PASSWORD_ALPHABETS.digits;
  const chars = [
    PASSWORD_ALPHABETS.upper[randomIndex(PASSWORD_ALPHABETS.upper.length)],
    PASSWORD_ALPHABETS.lower[randomIndex(PASSWORD_ALPHABETS.lower.length)],
    PASSWORD_ALPHABETS.digits[randomIndex(PASSWORD_ALPHABETS.digits.length)],
  ];
  while (chars.length < length) {
    chars.push(all[randomIndex(all.length)]);
  }
  // Fisher–Yates, ca primele trei caractere să nu fie mereu Mare-mică-cifră.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Copie a obiectului fără cheia dată (ex. eroarea unui câmp corectat). */
export function omitKey<T extends Record<string, unknown>>(record: T, key: string): T {
  if (!(key in record)) {
    return record;
  }
  const next = { ...record };
  delete next[key];
  return next;
}
