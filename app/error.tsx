"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // `retry` reîncarcă datele de pe server; `reset` ar randa din nou aceeași eroare.
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[App] Eroare:", error);
  }, [error]);

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Ceva nu a mers bine</h1>
      <p className="max-w-md text-muted-foreground">
        A apărut o eroare neașteptată. Reîncearcă sau contactează un
        administrator dacă problema persistă.
      </p>
      <Button onClick={() => retry()}>Reîncearcă</Button>
    </div>
  );
}
