import { Skeleton } from "@/components/ui/skeleton";

/** Schelet pentru jurnalul de activitate: filtre și rânduri. */
export default function AuditLogLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        Se încarcă jurnalul...
      </p>
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
        <div className="divide-y">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex items-start gap-4 px-4 py-3.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="hidden h-4 w-32 md:block" />
              <Skeleton className="h-5 w-36 rounded-full" />
              <div className="hidden flex-1 space-y-2 md:block">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
