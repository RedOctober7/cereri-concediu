import { prisma } from "@/lib/db";

/** Există deja un punct de lucru cu același nume (fără a ține cont de majuscule)? */
export async function workPointNameTaken(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.workPoint.findFirst({
    where: {
      name: { equals: name.trim(), mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

export const DUPLICATE_NAME_ERROR = {
  error: "Există deja un punct de lucru cu acest nume.",
  field: "name",
} as const;
