import { Skeleton } from "@/components/ui/skeleton";

/** Schelet pentru lista de utilizatori: antet, filtre și rânduri. */
export default function UsersLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        Se încarcă utilizatorii...
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row">
          <Skeleton className="h-9 w-full lg:max-w-xs" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-full lg:ml-auto lg:w-60" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-3.5">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-52 max-w-full" />
              </div>
              <Skeleton className="hidden h-4 w-28 md:block" />
              <Skeleton className="hidden h-4 w-32 md:block" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="hidden h-5 w-16 rounded-full md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
