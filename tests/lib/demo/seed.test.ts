import { describe, expect, it, vi } from "vitest";
import { demoAccountsCreatedAt, seedDemo } from "@/lib/demo/seed";
import { nextExpiringYear, openingBalanceYear } from "@/lib/leaves/rollover";

describe("demoAccountsCreatedAt", () => {
  // Ana Ionescu e angajată de 30 de luni: soldul ei inițial trebuie să cadă exact în
  // anul ale cărui zile expiră următoarele, în orice lună se refac datele.
  it.each([
    ["2026-10-14T01:30:00Z", 2025],
    ["2027-01-01T01:30:00Z", 2025],
    ["2027-03-10T01:30:00Z", 2025],
    ["2027-06-30T20:30:00Z", 2025], // 30 iunie, 23:30 în România
    ["2027-06-30T21:30:00Z", 2026], // 1 iulie, 00:30 în România
    ["2027-12-31T01:30:00Z", 2026],
  ])("la %s soldul inițial aparține anului %i, care expiră următorul", (iso, year) => {
    const now = new Date(iso);
    const hireDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 30, 1));
    expect(nextExpiringYear(now)).toBe(year);
    expect(openingBalanceYear(hireDate, demoAccountsCreatedAt(now))).toBe(year);
  });
});

describe("seedDemo", () => {
  /** Un client fals: fiecare metodă a unui model întoarce un rând cu id și își notează apelul. */
  function fakeClient() {
    const calls: string[] = [];
    let next = 0;
    const tx = new Proxy({} as Record<string, unknown>, {
      get(_target, model: string) {
        if (model === "$executeRaw") {
          return vi.fn(async (sql: TemplateStringsArray) => {
            calls.push(`$executeRaw ${sql.join("?")}`);
            return 1;
          });
        }
        return new Proxy({}, {
          get(_t, method: string) {
            return vi.fn(async () => {
              calls.push(`${model}.${method}`);
              return { id: `${model}_${next++}` };
            });
          },
        });
      },
    });
    const client = {
      $transaction: vi.fn<(fn: (client: unknown) => Promise<unknown>, options: unknown) => Promise<unknown>>(
        async (fn) => fn(tx)
      ),
    };
    return { client, calls };
  }

  it("totul rulează într-o singură tranzacție, cu lock-ul luat înainte de ștergere", async () => {
    const { client, calls } = fakeClient();
    const result = await seedDemo(client as never, new Date("2026-10-14T01:30:00Z"));

    expect(result).toEqual({ workPoints: 3, users: 11, leaves: 13 });
    expect(client.$transaction).toHaveBeenCalledOnce();
    expect(client.$transaction.mock.calls[0][1]).toMatchObject({ timeout: 45_000 });
    expect(calls[0]).toMatch(/^\$executeRaw SELECT pg_advisory_xact_lock\(/);
    expect(calls.slice(1, 8)).toEqual([
      "auditLog.deleteMany",
      "passwordReset.deleteMany",
      "leaveAccrual.deleteMany",
      "leaveRequest.deleteMany",
      "constraint.deleteMany",
      "user.deleteMany",
      "workPoint.deleteMany",
    ]);
    expect(calls.slice(8).every((call) => !call.endsWith(".deleteMany"))).toBe(true);
  });
});
