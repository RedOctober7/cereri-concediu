import { Skeleton } from "@/components/ui/skeleton";

/** Schelet pentru lista punctelor de lucru. */
export default function WorkPointsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        Se încarcă punctele de lucru...
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-60 max-w-full" />
            </div>
            <Skeleton className="hidden h-4 w-28 md:block" />
            <Skeleton className="hidden h-5 w-16 rounded-full md:block" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
