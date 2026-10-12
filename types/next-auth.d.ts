import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    mustChangePassword: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    mustChangePassword: boolean;
    /**
     * Momentul (ms, Date.now()) ultimei recitiri a rolului și a stării contului
     * din DB în callback-ul jwt. Lipsește în tokenurile emise înainte de revalidare.
     */
    checkedAt?: number;
  }
}
