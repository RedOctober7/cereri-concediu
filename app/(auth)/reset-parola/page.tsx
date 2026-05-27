import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ResetParolaPage() {
  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Resetare parolă</CardTitle>
        <CardDescription>
          Funcționalitatea de resetare parolă va fi disponibilă în fazele
          următoare.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button render={<Link href="/login" />} variant="outline" className="w-full">
          Înapoi la autentificare
        </Button>
      </CardContent>
    </Card>
  );
}
