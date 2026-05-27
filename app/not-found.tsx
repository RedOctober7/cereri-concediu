import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Pagina nu a fost găsită</h1>
      <p className="text-muted-foreground">
        Adresa accesată nu există sau a fost mutată.
      </p>
      <Button render={<Link href="/" />}>Înapoi acasă</Button>
    </div>
  );
}
