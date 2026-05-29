export type ValidationResult = {
  needsAdminApproval: boolean;
  violations: string[];
  workingDays: number;
};

export type ConstraintConfig =
  | { percent: number }
  | { days: number }
  | { month: number };
