"use client";

import { useMemo, useState } from "react";
import { ConstraintScope, ConstraintType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type WorkPoint = { id: string; name: string };
type Constraint = {
  id: string;
  scope: ConstraintScope;
  type: ConstraintType;
  active: boolean;
  config: Record<string, unknown>;
  workPoint: WorkPoint | null;
};

export function ConstraintsAdmin({
  initialConstraints,
  workPoints,
}: {
  initialConstraints: Constraint[];
  workPoints: WorkPoint[];
}) {
  const router = useRouter();
  const [scope, setScope] = useState<ConstraintScope>(ConstraintScope.GLOBAL);
  const [type, setType] = useState<ConstraintType>(ConstraintType.MIN_NOTICE_DAYS);
  const [workPointId, setWorkPointId] = useState("");
  const [value, setValue] = useState("");

  const configLabel = useMemo(() => {
    switch (type) {
      case ConstraintType.MAX_CONCURRENT_PERCENT:
        return "Procent maxim (1-100)";
      case ConstraintType.BLACKOUT_MONTH:
        return "Luna blocată (1-12)";
      default:
        return "Număr zile";
    }
  }, [type]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      toast.error("Valoarea introdusă este invalidă.");
      return;
    }

    const config =
      type === ConstraintType.MAX_CONCURRENT_PERCENT
        ? { percent: numericValue }
        : type === ConstraintType.BLACKOUT_MONTH
          ? { month: numericValue }
          : { days: numericValue };

    try {
      const response = await fetch("/api/admin/constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          type,
          workPointId: scope === ConstraintScope.WORK_POINT ? workPointId : null,
          config,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Nu s-a putut crea regula.");
      }
      toast.success("Regula a fost creată.");
      setValue("");
      setWorkPointId("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A apărut o eroare.");
    }
  }

  async function onToggle(id: string, active: boolean) {
    try {
      const response = await fetch(`/api/admin/constraints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Nu s-a putut actualiza regula.");
      }
      toast.success("Regula a fost actualizată.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A apărut o eroare.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Adaugă regulă nouă</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="scope">Scope</Label>
              <select
                id="scope"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={scope}
                onChange={(e) => setScope(e.target.value as ConstraintScope)}
              >
                <option value={ConstraintScope.GLOBAL}>Global</option>
                <option value={ConstraintScope.WORK_POINT}>Pe punct de lucru</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Tip regulă</Label>
              <select
                id="type"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as ConstraintType)}
              >
                {Object.values(ConstraintType).map((constraintType) => (
                  <option key={constraintType} value={constraintType}>
                    {constraintType}
                  </option>
                ))}
              </select>
            </div>
            {scope === ConstraintScope.WORK_POINT ? (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="workPoint">Punct de lucru</Label>
                <select
                  id="workPoint"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={workPointId}
                  onChange={(e) => setWorkPointId(e.target.value)}
                  required
                >
                  <option value="">Selectează punctul de lucru</option>
                  {workPoints.map((workPoint) => (
                    <option key={workPoint.id} value={workPoint.id}>
                      {workPoint.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="configValue">{configLabel}</Label>
              <Input
                id="configValue"
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Salvează regulă</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reguli existente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {initialConstraints.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nu există reguli.</p>
          ) : (
            initialConstraints.map((constraint) => (
              <div
                key={constraint.id}
                className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">{constraint.type}</p>
                  <p className="text-sm text-muted-foreground">
                    {constraint.scope === ConstraintScope.GLOBAL
                      ? "Global"
                      : `Punct lucru: ${constraint.workPoint?.name ?? "N/A"}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Config: {JSON.stringify(constraint.config)}
                  </p>
                </div>
                <Button
                  variant={constraint.active ? "destructive" : "default"}
                  onClick={() => onToggle(constraint.id, constraint.active)}
                >
                  {constraint.active ? "Dezactivează" : "Activează"}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
