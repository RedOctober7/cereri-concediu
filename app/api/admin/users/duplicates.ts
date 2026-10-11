import { prisma } from "@/lib/db";

/**
 * Mesajul 409 pentru un username sau email deja folosit (de oricine, inclusiv conturi
 * dezactivate), cu câmpul vizat, ca formularul să arate eroarea lângă el.
 */
export async function findDuplicateAccount(
  { username, email }: { username?: string; email?: string },
  excludeId?: string
): Promise<{ error: string; field: "username" | "email" } | null> {
  const or = [
    ...(username ? [{ username }] : []),
    ...(email ? [{ email }] : []),
  ];
  if (or.length === 0) {
    return null;
  }
  const existing = await prisma.user.findFirst({
    where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { username: true, email: true },
  });
  if (!existing) {
    return null;
  }
  if (username && existing.username === username) {
    return {
      error: "Numele de utilizator este deja folosit de alt cont.",
      field: "username",
    };
  }
  return { error: "Există deja un cont cu această adresă de email.", field: "email" };
}
