import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Bun venit, {session?.user?.name ?? "angajat"}!
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Fază 1 — Fundație</CardTitle>
          <CardDescription>
            Panoul angajatului va fi completat în Faza 3.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Autentificarea funcționează. Poți continua testarea sau aștepta
            implementarea funcționalităților de concediu.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
