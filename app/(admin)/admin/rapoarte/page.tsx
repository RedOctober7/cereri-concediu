'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Report = {
  id: string;
  title: string;
  description: string;
  columns: string[];
  format: string;
  endpoint: string;
  fallbackFileName: string;
};

const REPORTS: Report[] = [
  {
    id: 'leave-balance',
    title: 'Situație zile concediu',
    description:
      'Soldul fiecărui angajat activ pentru anul curent, gata de trimis la contabilitate sau de arhivat.',
    columns: [
      'Nume',
      'Funcție',
      'Punct de lucru',
      'Zile inițiale',
      'Zile acumulate',
      'Zile luate',
      'Zile disponibile',
    ],
    format: 'Excel (.xlsx), anul curent',
    endpoint: '/api/admin/reports/leave-balance',
    fallbackFileName: 'situatie-zile.xlsx',
  },
];

async function downloadReport(report: Report) {
  const res = await fetch(report.endpoint);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Raportul nu a putut fi generat. Reîncearcă.');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Numele vine de la server (anul curent în România), cu un nume de rezervă.
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  a.download = match?.[1] ?? report.fallbackFileName;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function ReportCard({ report }: { report: Report }) {
  const [loading, setLoading] = useState(false);

  async function onDownload() {
    setLoading(true);
    try {
      await downloadReport(report);
      toast.success('Raportul a fost descărcat.');
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'A apărut o eroare.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{report.title}</CardTitle>
        <CardDescription>{report.description}</CardDescription>
        <CardAction>
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileSpreadsheet aria-hidden="true" className="size-5" />
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Coloane</p>
          <ul className="flex flex-wrap gap-1.5">
            {report.columns.map((column) => (
              <li
                key={column}
                className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-foreground"
              >
                {column}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">Format: {report.format}</p>
      </CardContent>
      <CardFooter className="mt-auto">
        <Button className="h-9 gap-2 px-3" onClick={onDownload} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Download />}
          {loading ? 'Se generează...' : 'Descarcă Excel'}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function RapoartePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rapoarte</h1>
        <p className="text-muted-foreground">
          Exporturi pentru evidența concediilor, generate din datele actuale.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      </div>
    </div>
  );
}
