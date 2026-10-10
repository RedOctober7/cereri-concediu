import { Skeleton } from "@/components/ui/skeleton";

/** Schelet pentru lista de cereri: taburi, filtre și rânduri. */
export default function CereriLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        Se încarcă cererile...
      </p>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="space-y-3 border-b p-4">
          <Skeleton className="h-10 w-full max-w-xl" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Skeleton className="h-9 w-full sm:max-w-xs" />
            <Skeleton className="h-9 w-full sm:w-56" />
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-3.5">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
              <Skeleton className="hidden h-4 w-32 md:block" />
              <Skeleton className="hidden h-5 w-24 rounded-full md:block" />
              <Skeleton className="h-7 w-36" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
