import { ConstraintScope, ConstraintType, LeaveStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), count: vi.fn() },
  leaveRequest: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  constraint: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));

import { OVERLAPPING_LEAVE_MESSAGE, validateLeaveRequest } from "@/lib/constraints/validate";

const USER_ID = "user_1";
// „Azi” în România: luni, 12 octombrie 2026, ora 09:00.
const NOW = new Date("2026-10-12T06:00:00Z");

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    active: true,
    deletedAt: null,
    availableDays: 20,
    workPointId: "wp_1",
    workPoint: { id: "wp_1", name: "Sediu" },
    ...overrides,
  };
}

function constraint(type: ConstraintType, config: Record<string, number>) {
  return { id: `c_${type}`, scope: ConstraintScope.GLOBAL, type, workPointId: null, config, active: true };
}

describe("validateLeaveRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    db.user.findUnique.mockResolvedValue(activeUser());
    db.user.count.mockResolvedValue(4);
    db.leaveRequest.findFirst.mockResolvedValue(null);
    db.leaveRequest.count.mockResolvedValue(0);
    db.leaveRequest.findMany.mockResolvedValue([]);
    db.constraint.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("o cerere fără probleme nu are atenționări", async () => {
    await expect(validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-23"))).resolves.toEqual({
      violations: [],
      workingDays: 5,
      blockingError: null,
    });
  });

  describe("blocări (cererea nu poate fi depusă deloc)", () => {
    it("o perioadă care începe în trecut", async () => {
      const result = await validateLeaveRequest(USER_ID, day("2026-10-09"), day("2026-10-14"));
      expect(result.blockingError).toBe("Perioada selectată trebuie să fie în viitor.");
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });

    it("azi este încă permis", async () => {
      const result = await validateLeaveRequest(USER_ID, day("2026-10-12"), day("2026-10-12"));
      expect(result.blockingError).toBeNull();
    });

    it("o perioadă care se termină la peste un an de azi", async () => {
      const result = await validateLeaveRequest(USER_ID, day("2027-10-11"), day("2027-10-13"));
      expect(result.blockingError).toBe("Perioada nu poate depăși un an de la data curentă.");
    });

    it.each([
      ["doar weekend", "2026-10-17", "2026-10-18"],
      ["doar sărbători (Sf. Andrei, Ziua Națională)", "2026-11-30", "2026-12-01"],
    ])("zero zile lucrătoare: %s", async (_label, start, end) => {
      const result = await validateLeaveRequest(USER_ID, day(start), day(end));
      expect(result).toEqual({
        violations: [],
        workingDays: 0,
        blockingError: "Selectează cel puțin o zi lucrătoare.",
      });
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ["inactiv", activeUser({ active: false })],
      ["șters", activeUser({ deletedAt: new Date("2026-09-01T10:00:00Z") })],
      ["inexistent", null],
    ])("utilizator %s", async (_label, user) => {
      db.user.findUnique.mockResolvedValue(user);
      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-23"));
      expect(result.blockingError).toBe("Contul utilizatorului nu este valid.");
      expect(db.leaveRequest.findFirst).not.toHaveBeenCalled();
    });

    it("o cerere proprie activă care se suprapune", async () => {
      db.leaveRequest.findFirst.mockResolvedValue({ id: "leave_1" });
      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-23"));
      expect(result.blockingError).toBe(OVERLAPPING_LEAVE_MESSAGE);
      expect(result.workingDays).toBe(5);
      expect(db.constraint.findMany).not.toHaveBeenCalled();

      expect(db.leaveRequest.findFirst).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          status: {
            in: [LeaveStatus.PENDING_ADMIN, LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN],
          },
          startDate: { lte: day("2026-10-23") },
          endDate: { gte: day("2026-10-19") },
        },
        select: { id: true },
      });
    });
  });

  describe("încălcări (atenționări pentru administrator)", () => {
    it("mai multe zile decât soldul", async () => {
      db.user.findUnique.mockResolvedValue(activeUser({ availableDays: 3 }));
      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-23"));
      expect(result.blockingError).toBeNull();
      expect(result.violations).toEqual([
        "Cererea depășește zilele disponibile (3 disponibile, 5 solicitate)",
      ]);
    });

    it("regulile active ale angajatului", async () => {
      db.constraint.findMany.mockResolvedValue([
        constraint(ConstraintType.MIN_NOTICE_DAYS, { days: 10 }),
        constraint(ConstraintType.BLACKOUT_MONTH, { month: 10 }),
        constraint(ConstraintType.MIN_ONE_VACATION_OF_N_DAYS, { days: 10 }),
      ]);
      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-23"));

      expect(result.blockingError).toBeNull();
      expect(result.violations).toEqual([
        "Preaviz minim 10 zile lucrătoare (cererea trebuia depusă cu cel puțin 10 zile înainte)",
        "Luna Octombrie este perioadă restricționată",
      ]);
      expect(db.constraint.findMany).toHaveBeenCalledWith({
        where: {
          active: true,
          OR: [{ scope: ConstraintScope.GLOBAL }, { workPointId: "wp_1" }],
        },
      });
    });

    it("regulile respectate nu produc încălcări", async () => {
      db.constraint.findMany.mockResolvedValue([
        constraint(ConstraintType.MIN_NOTICE_DAYS, { days: 5 }),
        constraint(ConstraintType.BLACKOUT_MONTH, { month: 12 }),
      ]);

      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-23"));
      expect(result.violations).toEqual([]);
    });

  });

  describe("concediu neîntrerupt anual (MIN_ONE_VACATION_OF_N_DAYS, Codul muncii art. 148)", () => {
    const rule = () => [constraint(ConstraintType.MIN_ONE_VACATION_OF_N_DAYS, { days: 10 })];

    it("cererea care coboară soldul sub N, fără concediu lung în an, merge la administrator", async () => {
      db.user.findUnique.mockResolvedValue(activeUser({ availableDays: 12 }));
      db.constraint.findMany.mockResolvedValue(rule());
      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-23"));
      expect(result.blockingError).toBeNull();
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toMatch(/^În 2026 nu există încă un concediu neîntrerupt de cel puțin 10 zile lucrătoare, iar după această cerere ar rămâne 7 zile disponibile/);
    });

    it("soldul rămâne suficient pentru un concediu de N zile: fără încălcare", async () => {
      db.user.findUnique.mockResolvedValue(activeUser({ availableDays: 20 }));
      db.constraint.findMany.mockResolvedValue(rule());
      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-23"));
      expect(result.violations).toEqual([]);
    });

    it("un concediu aprobat de cel puțin N zile în același an: fără încălcare", async () => {
      db.user.findUnique.mockResolvedValue(activeUser({ availableDays: 12 }));
      db.constraint.findMany.mockResolvedValue(rule());
      db.leaveRequest.findMany.mockResolvedValue([
        { startDate: day("2026-07-06"), endDate: day("2026-07-17"), workingDays: 10, status: LeaveStatus.APPROVED_ADMIN },
      ]);
      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-23"));
      expect(result.violations).toEqual([]);
    });

    it("cererea lipită de un concediu existent ajunge împreună la N zile: fără încălcare", async () => {
      db.user.findUnique.mockResolvedValue(activeUser({ availableDays: 12 }));
      db.constraint.findMany.mockResolvedValue(rule());
      db.leaveRequest.findMany.mockResolvedValue([
        { startDate: day("2026-10-26"), endDate: day("2026-10-30"), workingDays: 5, status: LeaveStatus.APPROVED_AUTO },
      ]);
      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-23"));
      expect(result.violations).toEqual([]);
    });

    it("soldul era deja sub N înainte de cerere: cererea nu schimbă nimic și trece", async () => {
      db.user.findUnique.mockResolvedValue(activeUser({ availableDays: 8 }));
      db.constraint.findMany.mockResolvedValue(rule());
      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-20"));
      expect(result.violations).toEqual([]);
    });

    it("cererea însăși are cel puțin N zile: fără interogări și fără încălcare", async () => {
      db.user.findUnique.mockResolvedValue(activeUser({ availableDays: 12 }));
      db.constraint.findMany.mockResolvedValue(rule());
      const result = await validateLeaveRequest(USER_ID, day("2026-10-19"), day("2026-10-30"));
      expect(result.violations).toEqual([]);
      expect(db.leaveRequest.findMany).not.toHaveBeenCalled();
    });
  });
});
