import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { error: "Trebuie să fii autentificat.", status: 401 } as const;
  }

  // Contul cu parolă resetată de admin nu folosește API-ul până nu o schimbă
  // (proxy-ul vede doar cookie-ul, care poate fi vechi). Schimbarea parolei
  // merge în continuare: /api/profile/password nu trece prin această funcție.
  if (session.user.mustChangePassword) {
    return {
      error: "Trebuie să îți schimbi parola înainte de a continua.",
      status: 403,
    } as const;
  }

  if (session.user.role !== "ADMIN") {
    return { error: "Nu ai permisiunea necesară.", status: 403 } as const;
  }

  return { session } as const;
}
