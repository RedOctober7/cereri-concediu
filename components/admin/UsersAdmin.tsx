"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type WorkPoint = { id: string; name: string };
type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  jobTitle: string;
  employer: string;
  active: boolean;
  availableDays: number;
  workPoint: WorkPoint | null;
};

export function UsersAdmin({
  initialUsers,
  workPoints,
}: {
  initialUsers: User[];
  workPoints: WorkPoint[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    jobTitle: "",
    employer: "",
    workPointId: "",
    hireDate: "",
    initialLeaveDays: "21",
  });

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          workPointId: formData.workPointId || null,
          initialLeaveDays: Number(formData.initialLeaveDays),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Nu s-a putut crea utilizatorul.");
      }
      toast.success("Utilizatorul a fost creat.");
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        username: "",
        password: "",
        jobTitle: "",
        employer: "",
        workPointId: "",
        hireDate: "",
        initialLeaveDays: "21",
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A apărut o eroare.");
    } finally {
      setLoading(false);
    }
  }

  async function onToggleActive(userId: string, active: boolean) {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Nu s-a putut actualiza statusul.");
      }
      toast.success("Statusul utilizatorului a fost actualizat.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A apărut o eroare.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Adaugă utilizator</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
            {[
              { key: "firstName", label: "Prenume" },
              { key: "lastName", label: "Nume" },
              { key: "email", label: "Email", type: "email" },
              { key: "username", label: "Username" },
              { key: "password", label: "Parolă", type: "password" },
              { key: "jobTitle", label: "Funcție" },
              { key: "employer", label: "Angajator" },
            ].map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type={field.type ?? "text"}
                  required
                  value={formData[field.key as keyof typeof formData]}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="hireDate">Data angajării</Label>
              <Input
                id="hireDate"
                type="date"
                required
                value={formData.hireDate}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, hireDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initialLeaveDays">Zile concediu inițiale</Label>
              <Input
                id="initialLeaveDays"
                type="number"
                min={0}
                step="0.5"
                required
                value={formData.initialLeaveDays}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    initialLeaveDays: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="workPointId">Punct de lucru</Label>
              <select
                id="workPointId"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={formData.workPointId}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, workPointId: e.target.value }))
                }
              >
                <option value="">Fără punct de lucru</option>
                {workPoints.map((workPoint) => (
                  <option key={workPoint.id} value={workPoint.id}>
                    {workPoint.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Se salvează..." : "Creează utilizator"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Utilizatori existenți</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {initialUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nu există utilizatori.</p>
          ) : (
            initialUsers.map((user) => (
              <div
                key={user.id}
                className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {user.lastName} {user.firstName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {user.email} • {user.jobTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.workPoint?.name ?? "Fără punct de lucru"} •{" "}
                    {user.availableDays.toFixed(2)} zile disponibile
                  </p>
                </div>
                <Button
                  variant={user.active ? "destructive" : "default"}
                  onClick={() => onToggleActive(user.id, user.active)}
                >
                  {user.active ? "Dezactivează" : "Activează"}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
