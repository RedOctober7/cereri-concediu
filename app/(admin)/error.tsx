"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/** Eroare într-o pagină de admin: meniul rămâne, conținutul se poate reîncărca. */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[Admin] Eroare:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert aria-hidden="true" className="size-6" />
      </span>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Pagina nu a putut fi încărcată</h1>
        <p className="text-muted-foreground">
          Datele nu au putut fi citite. Reîncearcă peste câteva momente; dacă problema
          persistă, contactează suportul tehnic.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">Cod eroare: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button className="h-9 gap-2 px-3" onClick={() => unstable_retry()}>
          <RotateCw />
          Reîncearcă
        </Button>
        <Link href="/admin" className={buttonVariants({ variant: "outline", className: "h-9 px-3" })}>
          Înapoi la panou
        </Link>
      </div>
    </div>
  );
}
