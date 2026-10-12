import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UsersAdmin, type UserFilters } from "@/components/admin/UsersAdmin";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Filtrele din URL (?q=&status=&punct=), ca lista să rămână filtrată la întoarcere. */
function parseFilters(params: SearchParams): UserFilters {
  const status = single(params.status);
  return {
    q: single(params.q).slice(0, 100),
    status: status === "activi" || status === "inactivi" ? status : "toti",
    workPoint: single(params.punct).slice(0, 64),
  };
}

/** Valoarea cea mai des întâlnită (angajatorul precompletat la un cont nou). */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const [users, workPoints, params] = await Promise.all([
    prisma.user.findMany({
      where: { role: "EMPLOYEE" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        username: true,
        jobTitle: true,
        employer: true,
        active: true,
        availableDays: true,
        mustChangePassword: true,
        workPoint: { select: { id: true, name: true } },
      },
    }),
    prisma.workPoint.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    searchParams,
  ]);

  // Sortare după regulile limbii române (Ș după S, Ț după T), nu după colația bazei.
  const collator = new Intl.Collator("ro", { sensitivity: "base" });
  const sorted = [...users].sort(
    (a, b) =>
      collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName)
  );
  const jobTitles = [...new Set(users.map((user) => user.jobTitle))].sort(collator.compare);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <UsersAdmin
        users={sorted}
        workPoints={workPoints}
        initialFilters={parseFilters(params)}
        defaultEmployer={mostCommon(users.map((user) => user.employer))}
        jobTitles={jobTitles}
      />
    </div>
  );
}
