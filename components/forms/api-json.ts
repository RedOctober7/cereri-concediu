// Răspunsurile API citite din formularele angajatului. Fără sesiune, proxy-ul
// redirecționează cererea spre pagina de login (HTML): `res.json()` ar arunca
// „Unexpected token '<'”, iar angajatul ar vedea textul acela în loc de o explicație.

export const SESSION_EXPIRED_MESSAGE =
  "Sesiunea s-a încheiat. Reîncarcă pagina și autentifică-te din nou.";

const NETWORK_MESSAGE = "Nu s-a putut contacta serverul. Verifică conexiunea și încearcă din nou.";

/** Corpul JSON al răspunsului; o redirecționare sau un corp care nu e JSON devin o eroare clară. */
export async function readApiJson<T>(res: Response): Promise<T> {
  if (res.redirected) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(
      res.ok || res.status === 401 ? SESSION_EXPIRED_MESSAGE : "A apărut o eroare. Reîncearcă în câteva momente."
    );
  }
}

/** Mesajul de afișat pentru o eroare prinsă: rețeaua picată nu arată textul tehnic al browserului. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return NETWORK_MESSAGE;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
