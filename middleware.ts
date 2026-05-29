import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";

const employeeRoutes = ["/dashboard", "/cereri", "/profil"];
const adminRoutes = ["/admin"];

function matchesPath(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    if (token?.mustChangePassword) {
      const allowedWhenMustChange = [
        "/schimba-parola",
        "/api/profile/password",
        "/api/auth",
        "/login",
      ];
      const isAllowed = allowedWhenMustChange.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`)
      );

      if (!isAllowed) {
        return NextResponse.redirect(new URL("/schimba-parola", req.url));
      }
    }

    if (matchesPath(pathname, adminRoutes)) {
      if (token?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    if (pathname.startsWith("/api/admin")) {
      if (token?.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Nu ai permisiunea necesară." },
          { status: 403 }
        );
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        if (
          pathname.startsWith("/login") ||
          pathname.startsWith("/reset-parola") ||
          pathname === "/"
        ) {
          return true;
        }

        if (pathname.startsWith("/api/auth")) {
          return true;
        }

        if (pathname.startsWith("/api/cron")) {
          return true;
        }

        if (pathname.startsWith("/api/password-reset")) {
          return true;
        }

        const protectedPrefixes = [
          ...employeeRoutes,
          ...adminRoutes,
          "/schimba-parola",
        ];

        if (matchesPath(pathname, protectedPrefixes)) {
          return !!token;
        }

        if (pathname.startsWith("/api/admin")) {
          return !!token && token.role === ("ADMIN" as Role);
        }

        if (pathname.startsWith("/api/profile")) {
          return !!token;
        }

        if (pathname.startsWith("/api/leaves")) {
          return !!token;
        }

        return true;
      },
    },
  }
);

export const config = {
  matcher: [
    "/",
    "/login",
    "/reset-parola/:path*",
    "/schimba-parola",
    "/dashboard/:path*",
    "/cereri/:path*",
    "/profil/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/profile/:path*",
    "/api/leaves/:path*",
  ],
};
