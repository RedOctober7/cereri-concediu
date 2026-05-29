import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { error: "Trebuie să fii autentificat.", status: 401 } as const;
  }

  return { session } as const;
}
