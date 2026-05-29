"use client";

import { format } from "date-fns";
import { ro } from "date-fns/locale";
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

const MONTH_NAMES = [
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
];

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
              {format(user.hireDate, "dd.MM.yyyy", { locale: ro })}
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
                        {MONTH_NAMES[accrual.month - 1]} {accrual.year}
                      </td>
                      <td className="py-2 pr-4">{accrual.days.toFixed(2)}</td>
                      <td className="py-2">
                        {format(accrual.createdAt, "dd.MM.yyyy", { locale: ro })}
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
