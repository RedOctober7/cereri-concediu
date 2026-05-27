import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default async function SchimbaParolaPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.mustChangePassword) {
    redirect(session.user.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Schimbă parola</CardTitle>
        <CardDescription>
          Din motive de securitate, trebuie să îți setezi o parolă nouă înainte
          de a continua.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Prima autentificare</AlertTitle>
          <AlertDescription>
            Parola temporară trebuie înlocuită cu una personală.
          </AlertDescription>
        </Alert>
        <ChangePasswordForm />
      </CardContent>
    </Card>
  );
}
