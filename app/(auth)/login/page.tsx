import { Suspense } from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function LoginFormFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    if (session.user.mustChangePassword) {
      redirect("/schimba-parola");
    }
    if (session.user.role === "ADMIN") {
      redirect("/admin");
    }
    redirect("/dashboard");
  }

  const appName = process.env.APP_NAME ?? "Cereri Concediu";

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{appName}</CardTitle>
        <CardDescription>
          Autentifică-te pentru a gestiona cererile de concediu
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/reset-parola"
            className="text-primary underline-offset-4 hover:underline"
          >
            Ai uitat parola?
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
