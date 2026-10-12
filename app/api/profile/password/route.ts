import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { DEMO_PROTECTED_MESSAGE, isProtectedDemoAccount } from "@/lib/demo/accounts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changePasswordSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Trebuie să fii autentificat." },
        { status: 401 }
      );
    }

    const body: unknown = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      omit: { passwordHash: false },
    });

    if (!user || !user.active || user.deletedAt) {
      return NextResponse.json(
        { error: "Contul nu a fost găsit." },
        { status: 404 }
      );
    }

    if (isProtectedDemoAccount(user.username)) {
      return NextResponse.json({ error: DEMO_PROTECTED_MESSAGE }, { status: 403 });
    }

    const validCurrent = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );

    if (!validCurrent) {
      return NextResponse.json(
        { error: "Parola curentă este incorectă." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Profile] Eroare schimbare parolă:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
