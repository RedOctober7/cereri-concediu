"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

/** Eroare într-o pagină a angajatului: meniul rămâne, conținutul se poate reîncărca. */
export default function EmployeeError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[Angajat] Eroare:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert aria-hidden="true" className="size-6" />
      </span>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Pagina nu a putut fi încărcată</h1>
        <p className="text-muted-foreground">
          Reîncearcă peste câteva momente. Dacă problema persistă, anunță administratorul.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">Cod eroare: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button className="h-9 gap-2 px-3" onClick={() => retry()}>
          <RotateCw />
          Reîncearcă
        </Button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>
          Înapoi la panou
        </Link>
      </div>
    </div>
  );
}
