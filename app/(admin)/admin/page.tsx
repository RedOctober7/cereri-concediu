import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Panou administrator
        </h1>
        <p className="text-muted-foreground">
          Bun venit, {session?.user?.name ?? "admin"}!
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Fază 1 — Fundație</CardTitle>
          <CardDescription>
            CRUD utilizatori, puncte de lucru și reguli — Faza 2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Autentificarea ca administrator funcționează. Următorul pas: gestionare
            utilizatori și puncte de lucru.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
