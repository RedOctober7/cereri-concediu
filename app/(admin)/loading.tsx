import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton({ lines, className }: { lines: number; className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10", className)}>
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="h-3.5 w-full" />
      ))}
    </div>
  );
}

/** Schelet generic pentru paginile de admin, afișat în interiorul meniului. */
export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        Se încarcă...
      </p>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={6} />
      </div>
    </div>
  );
}
