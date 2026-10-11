import { Skeleton } from "@/components/ui/skeleton";

/** Schelet pentru pagina de reguli: antet, notă și câte un card pe tip de regulă. */
export default function ConstraintsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        Se încarcă regulile...
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
      <Skeleton className="h-14 w-full" />
      <div className="space-y-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="space-y-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-3.5 w-full max-w-2xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
