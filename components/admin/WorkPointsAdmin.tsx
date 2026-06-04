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
      toast.error(error instanceof Error ? error.message : "A aparut o eroare.");