"use client";

import { formatInTimeZone } from "date-fns-tz";
import { APP_TIME_ZONE } from "@/lib/dates";
import { formatDay, formatDays, formatMonthYear } from "@/components/admin/format";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ProfileUser = {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  employer: string;
  hireDate: Date;
  workPoint: { name: string } | null;
};

type Accrual = {
  month: number;
  year: number;
  days: number;
  createdAt: Date;
};

export function ProfileContent({
  user,
  accruals,
}: {
  user: ProfileUser;
  accruals: Accrual[];
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Date personale</CardTitle>
          <CardDescription>
            Aceste informații pot fi modificate doar de administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Nume complet</p>
            <p className="font-medium">
              {user.lastName} {user.firstName}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium">{user.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Funcție</p>
            <p className="font-medium">{user.jobTitle}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Angajator</p>
            <p className="font-medium">{user.employer}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Punct de lucru</p>
            <p className="font-medium">
              {user.workPoint?.name ?? "Neatribuit"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Data angajării</p>
            <p className="font-medium">
              {formatDay(user.hireDate)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schimbare parolă</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Istoric zile concediu</CardTitle>
          <CardDescription>Acumulări lunare înregistrate în sistem.</CardDescription>
        </CardHeader>
        <CardContent>
          {accruals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nu există încă acumulări înregistrate.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Perioadă</th>
                    <th className="pb-2 pr-4 font-medium">Zile</th>
                    <th className="pb-2 font-medium">Înregistrat</th>
                  </tr>
                </thead>
                <tbody>
                  {accruals.map((accrual) => (
                    <tr key={`${accrual.year}-${accrual.month}`} className="border-b">
                      <td className="py-2 pr-4">
                        {formatMonthYear(accrual.month, accrual.year)}
                      </td>
                      <td className="py-2 pr-4">{formatDays(accrual.days)}</td>
                      <td className="py-2">
                        {/* Momentul, în ora României: la fel pe server (UTC) și în browser. */}
                        {formatInTimeZone(accrual.createdAt, APP_TIME_ZONE, "dd.MM.yyyy")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
