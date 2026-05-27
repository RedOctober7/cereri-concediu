import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/schimba-parola");
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b bg-card px-4 py-3">
        <p className="text-sm font-medium">
          {process.env.APP_NAME ?? "Cereri Concediu"}
        </p>
      </header>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
