import { LeaveStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  leaveRequest: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma }));

import {
  findColleagueAbsences,
  findColleagueLeaves,
  groupColleagueAbsences,
  toAbsenceViews,
  type ColleagueLeave,
} from "@/lib/leaves/colleague-absences";
import { formatPeriod } from "@/components/admin/format";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

// Cererea analizată: Andrei, punctul wp_1, 19–23 octombrie 2026.
const request = {
  userId: "andrei",
  workPointId: "wp_1",
  start: day("2026-10-19"),
  end: day("2026-10-23"),
};

function leave(overrides: Partial<ColleagueLeave> & { name?: string } = {}): ColleagueLeave {
  const { name = "Ioana Stan", ...rest } = overrides;
  const [firstName, lastName] = name.split(" ");
  return {
    userId: "ioana",
    startDate: day("2026-10-20"),
    endDate: day("2026-10-21"),
    status: LeaveStatus.APPROVED_ADMIN,
    user: { firstName, lastName, workPointId: "wp_1" },
    ...rest,
  };
}

describe("groupColleagueAbsences", () => {
  it("arată colegul de la același punct de lucru care lipsește în perioada cererii", () => {
    expect(groupColleagueAbsences(request, [leave()])).toEqual([
      {
        userId: "ioana",
        firstName: "Ioana",
        lastName: "Stan",
        periods: [{ start: day("2026-10-20"), end: day("2026-10-21"), pending: false }],
      },
    ]);
  });

  it("ignoră cererile proprii, alte puncte de lucru și concediile care nu se suprapun", () => {
    const leaves = [
      leave({ userId: "andrei", name: "Andrei Dumitru" }),
      leave({
        userId: "mihai",
        name: "Mihai Pop",
        user: { firstName: "Mihai", lastName: "Pop", workPointId: "wp_2" },
      }),
      leave({ startDate: day("2026-10-12"), endDate: day("2026-10-16") }),
      leave({ startDate: day("2026-10-26"), endDate: day("2026-10-30") }),
    ];
    expect(groupColleagueAbsences(request, leaves)).toEqual([]);
  });

  it("concediile care ating doar prima sau ultima zi contează", () => {
    const leaves = [
      leave({ startDate: day("2026-10-14"), endDate: day("2026-10-19") }),
      leave({
        userId: "ana",
        name: "Ana Ionescu",
        startDate: day("2026-10-23"),
        endDate: day("2026-10-28"),
      }),
    ];
    const result = groupColleagueAbsences(request, leaves);
    expect(result.map((absence) => absence.userId)).toEqual(["ana", "ioana"]);
  });

  it("taie perioada colegului la perioada cererii", () => {
    const [absence] = groupColleagueAbsences(request, [
      leave({ startDate: day("2026-10-12"), endDate: day("2026-10-30") }),
    ]);
    expect(absence.periods).toEqual([
      { start: day("2026-10-19"), end: day("2026-10-23"), pending: false },
    ]);
  });

  it("numără oamenii, nu cererile: un coleg cu două concedii apare o dată", () => {
    const result = groupColleagueAbsences(request, [
      leave({ startDate: day("2026-10-22"), endDate: day("2026-10-23") }),
      leave({ startDate: day("2026-10-19"), endDate: day("2026-10-19") }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].periods.map((period) => period.start)).toEqual([
      day("2026-10-19"),
      day("2026-10-22"),
    ]);
  });

  it("marchează cererile colegilor încă neaprobate", () => {
    const [absence] = groupColleagueAbsences(request, [
      leave({ status: LeaveStatus.PENDING_ADMIN }),
      leave({
        status: LeaveStatus.APPROVED_AUTO,
        startDate: day("2026-10-23"),
        endDate: day("2026-10-23"),
      }),
    ]);
    expect(absence.periods.map((period) => period.pending)).toEqual([true, false]);
  });

  it("ordonează colegii după nume, apoi prenume, cu diacritice", () => {
    const result = groupColleagueAbsences(request, [
      leave({ userId: "t", name: "Ana Tudor" }),
      leave({ userId: "s2", name: "Maria Șerban" }),
      leave({ userId: "s1", name: "Ion Stan" }),
      leave({ userId: "s0", name: "Elena Stan" }),
    ]);
    expect(result.map((absence) => absence.userId)).toEqual(["s0", "s1", "s2", "t"]);
  });

  it("un angajat fără punct de lucru nu are colegi", () => {
    const leaves = [leave({ user: { firstName: "Ioana", lastName: "Stan", workPointId: null } })];
    expect(groupColleagueAbsences({ ...request, workPointId: null }, leaves)).toEqual([]);
  });
});

describe("toAbsenceViews", () => {
  const absences = groupColleagueAbsences(request, [
    leave({ status: LeaveStatus.PENDING_ADMIN }),
  ]);

  it("formatează perioadele pentru interfață, cu „Prenume Nume” implicit", () => {
    expect(toAbsenceViews(absences, formatPeriod)).toEqual([
      { name: "Ioana Stan", periods: [{ label: "20–21 oct 2026", pending: true }] },
    ]);
  });

  it("poate scrie „Nume Prenume”, ca în calendarul angajatului", () => {
    expect(toAbsenceViews(absences, formatPeriod, "lastFirst")[0].name).toBe("Stan Ioana");
  });
});

describe("findColleagueLeaves / findColleagueAbsences", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fără puncte de lucru nu interoghează baza de date", async () => {
    expect(
      await findColleagueLeaves({
        workPointIds: [],
        start: request.start,
        end: request.end,
        includePending: true,
      })
    ).toEqual([]);
    expect(
      await findColleagueAbsences({ ...request, workPointId: null }, { includePending: false })
    ).toEqual([]);
    expect(prisma.leaveRequest.findMany).not.toHaveBeenCalled();
  });

  it("angajatul vede doar concediile aprobate ale colegilor activi", async () => {
    prisma.leaveRequest.findMany.mockResolvedValue([leave()]);
    const result = await findColleagueAbsences(request, { includePending: false });

    expect(result.map((absence) => absence.userId)).toEqual(["ioana"]);
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN] },
          startDate: { lte: request.end },
          endDate: { gte: request.start },
          user: { workPointId: { in: ["wp_1"] }, active: true, deletedAt: null },
        },
      })
    );
  });

  it("adminul vede și cererile colegilor în așteptare", async () => {
    prisma.leaveRequest.findMany.mockResolvedValue([]);
    await findColleagueLeaves({
      workPointIds: ["wp_1", "wp_2"],
      start: request.start,
      end: request.end,
      includePending: true,
    });
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN, LeaveStatus.PENDING_ADMIN],
          },
          user: { workPointId: { in: ["wp_1", "wp_2"] }, active: true, deletedAt: null },
        }),
      })
    );
  });
});
