// Datele angajatului „înghețate” la depunerea cererii (LeaveRequest.employeeSnapshot):
// cererea de concediu e un document de personal, deci PDF-ul generat oricând mai târziu
// trebuie să arate numele, funcția și angajatorul de la data cererii.

export type EmployeeSnapshot = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  employer: string;
  workPointName: string | null;
};

export function employeeSnapshotFrom(user: {
  firstName: string;
  lastName: string;
  jobTitle: string;
  employer: string;
  workPoint: { name: string } | null;
}): EmployeeSnapshot {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    employer: user.employer,
    workPointName: user.workPoint?.name ?? null,
  };
}

/** Snapshot-ul din coloana JSON; null pentru cererile vechi sau un JSON nevalid. */
export function parseEmployeeSnapshot(value: unknown): EmployeeSnapshot | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  const text = (key: string) => (typeof v[key] === "string" ? (v[key] as string) : null);
  const firstName = text("firstName");
  const lastName = text("lastName");
  const jobTitle = text("jobTitle");
  const employer = text("employer");
  if (firstName === null || lastName === null || jobTitle === null || employer === null) {
    return null;
  }
  return { firstName, lastName, jobTitle, employer, workPointName: text("workPointName") };
}
