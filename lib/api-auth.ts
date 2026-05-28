import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { error: "Trebuie să fii autentificat.", status: 401 } as const;
  }

  if (session.user.role !== "ADMIN") {
    return { error: "Nu ai permisiunea necesară.", status: 403 } as const;
  }

  return { session } as const;
}
