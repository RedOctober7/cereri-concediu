/**
 * `callbackUrl` din query string → o cale relativă pe același site, sau null.
 *
 * Acceptă doar căi care încep cu „/”: nu „//evil.com” (URL relativ la protocol),
 * nu „/\evil.com” (browserele tratează „\” ca „/”), nu adrese absolute. La final
 * calea trece prin parserul URL al browserului (care scoate și tab-urile și
 * liniile noi, ex. „/\t/evil.com”), ca rezultatul să rămână pe `origin`.
 */
export function safeCallbackPath(raw: string | null | undefined, origin: string): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return null;
  }
  try {
    const url = new URL(raw, origin);
    if (url.origin !== new URL(origin).origin) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
