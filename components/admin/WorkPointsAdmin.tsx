"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type WorkPoint = {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
  _count?: {
    users: number;
    constraints: number;
  };
};

export function WorkPointsAdmin({ initialWorkPoints }: { initialWorkPoints: WorkPoint[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/admin/work-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Nu s-a putut crea punctul de lucru.");
      toast.success("Punctul de lucru a fost creat.");
      setName("");
      setAddress("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A apărut o eroare.");
    } finally {
      setLoading(false);
    }
  }

  async function onEdit(id: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/work-points/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, address: editAddress }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Nu s-a putut actualiza.");
      toast.success("Punct de lucru actualizat.");
      setEditId(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A apărut o eroare.");
    } finally {
      setLoading(false);
    }
  }

  async function onToggle(id: string, active: boolean) {
    try {
      const response = await fetch(`/api/admin/work-points/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Nu s-a putut actualiza statusul.");
      toast.success("Status actualizat.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A apărut o eroare.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Adaugă punct de lucru</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="wp-name">Nume</Label>
              <Input
                id="wp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Sediu Cluj"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wp-address">Adresă</Label>
              <Input
                id="wp-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Str. Memorandumului 10"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading}>
                {loading ? "Se salvează..." : "Salvează"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listă puncte de lucru</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {initialWorkPoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nu există puncte de lucru.</p>
          ) : (
            initialWorkPoints.map((workPoint) => (
              <div
                key={workPoint.id}
                className="rounded-md border p-3 space-y-3"
              >
                {editId === workPoint.id ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Nume</Label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Adresă</Label>
                      <Input
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2 md:col-span-2">
                      <Button size="sm" onClick={() => onEdit(workPoint.id)} disabled={loading}>
                        Salvează
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                        Anulează
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium">{workPoint.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {workPoint.address || "Fără adresă"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {workPoint._count?.users ?? 0} angajați,{" "}
                        {workPoint._count?.constraints ?? 0} reguli
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditId(workPoint.id);
                          setEditName(workPoint.name);
                          setEditAddress(workPoint.address || "");
                        }}
                      >
                        Editează
                      </Button>
                      <Button
                        size="sm"
                        variant={workPoint.active ? "destructive" : "default"}
                        onClick={() => onToggle(workPoint.id, workPoint.active)}
                      >
                        {workPoint.active ? "Dezactivează" : "Activează"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}