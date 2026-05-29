import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MyLeavesList } from "@/components/employee/MyLeavesList";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function MyLeavesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const leaves = await prisma.leaveRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cererile mele</h1>
          <p className="text-muted-foreground">
            Istoricul cererilor de concediu depuse de tine.
          </p>
        </div>
        <Button className="gap-2" render={<Link href="/cereri/noua" />}>
          <CalendarPlus className="size-4" />
          Cerere nouă
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listă cereri</CardTitle>
          <CardDescription>
            Poți anula cererile în așteptare care nu au început încă.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MyLeavesList leaves={leaves} />
        </CardContent>
      </Card>
    </div>
  );
}
