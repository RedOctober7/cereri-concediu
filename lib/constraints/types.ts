export type ValidationResult = {
  needsAdminApproval: boolean;
  violations: string[];
  workingDays: number;
  /** Motiv pentru care cererea nu poate fi depusă deloc (nici spre admin). */
  blockingError: string | null;
};

export type ConstraintConfig =
  | { percent: number }
  | { days: number }
  | { month: number };
