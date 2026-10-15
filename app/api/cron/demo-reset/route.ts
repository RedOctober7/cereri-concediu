import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyCronRequest } from '@/lib/cron-auth';
import { seedDemo } from '@/lib/demo/seed';

// Refacerea datelor demo în fiecare noapte (vercel.json): ce schimbă vizitatorii într-o zi
// dispare, iar datele sunt din nou relative la ziua de azi. Ca `npm run db:seed-demo`,
// ȘTERGE toată baza, deci rulează doar cu DEMO_MODE=true pe server.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) {
    return authError;
  }

  // O instanță reală, pornită din același cod, primește și ea apelul din vercel.json:
  // îl ignoră, fără să atingă datele și fără să apară ca eroare în Vercel.
  if (process.env.DEMO_MODE !== 'true') {
    console.log('[DemoReset] DEMO_MODE nu este activ; datele nu au fost atinse.');
    return NextResponse.json({ success: true, skipped: true });
  }

  // Un client separat, ca în `npm run db:seed-demo`: seedDemo scrie și passwordHash, pe
  // care clientul aplicației (lib/db.ts) îl ascunde din rezultate.
  const client = new PrismaClient();
  try {
    const result = await seedDemo(client);
    console.log(
      `[DemoReset] Date demo refăcute: ${result.users} conturi, ${result.workPoints} puncte de lucru, ${result.leaves} cereri.`
    );
    return NextResponse.json({ success: true, skipped: false, ...result });
  } catch (error) {
    console.error('[DemoReset] Eroare:', error);
    return NextResponse.json(
      { error: 'Datele demo nu au putut fi refăcute.', success: false },
      { status: 500 }
    );
  } finally {
    await client.$disconnect();
  }
}
