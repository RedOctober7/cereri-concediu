"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConstraintScope, ConstraintType } from "@prisma/client";
import {
  CalendarClock,
  CalendarOff,
  Globe,
  Info,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
  TreePalm,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField, PageHeader } from "@/components/admin/admin-ui";
import { apiRequest, fieldErrorsFrom } from "@/components/admin/form-utils";
import {
  CONSTRAINT_TYPES,
  CONSTRAINT_TYPE_ORDER,
  MONTH_NAMES,
  describeConstraint,
} from "@/lib/constraints/types";
import { constraintCreateSchema } from "@/lib/validators";
import { cn } from "@/lib/utils";

type WorkPoint = { id: string; name: string; active: boolean };

export type ConstraintRow = {
  id: string;
  scope: ConstraintScope;
  type: ConstraintType;
  active: boolean;
  config: Record<string, unknown>;
  workPoint: { id: string; name: string } | null;
};

const TYPE_ICONS: Record<ConstraintType, LucideIcon> = {
  MIN_NOTICE_DAYS: CalendarClock,
  BLACKOUT_MONTH: CalendarOff,
  MIN_ONE_VACATION_OF_N_DAYS: TreePalm,
};

type DialogState = {
  open: boolean;
  key: number;
  /** null = regulă nouă. */
  editing: ConstraintRow | null;
  type: ConstraintType;
};

function scopeLabel(rule: ConstraintRow) {
  return rule.scope === "GLOBAL"
    ? "Toate punctele de lucru"
    : (rule.workPoint?.name ?? "Punct de lucru șters");
}

function RuleDialog({
  state,
  onOpenChange,
  workPoints,
}: {
  state: DialogState;
  onOpenChange: (open: boolean) => void;
  workPoints: WorkPoint[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { editing } = state;
  const [type, setType] = useState<ConstraintType>(editing?.type ?? state.type);
  const info = CONSTRAINT_TYPES[type];
  const [scope, setScope] = useState<ConstraintScope>(editing?.scope ?? "GLOBAL");
  const [workPointId, setWorkPointId] = useState(editing?.workPoint?.id ?? "");
  const [value, setValue] = useState(() => {
    const current = editing?.config[info.field.key];
    return String(typeof current === "number" ? current : info.field.defaultValue);
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Punctele inactive nu se aleg pentru reguli noi; cel deja ales rămâne în listă.
  const workPointOptions = workPoints.filter(
    (workPoint) => workPoint.active || workPoint.id === editing?.workPoint?.id
  );
  const noWorkPoints = workPointOptions.length === 0;

  function changeType(next: ConstraintType) {
    setType(next);
    setValue(String(CONSTRAINT_TYPES[next].field.defaultValue));
    setErrors({});
  }

  const input = {
    type,
    scope,
    workPointId: scope === "WORK_POINT" ? workPointId || null : null,
    config: { [info.field.key]: value.trim() === "" ? Number.NaN : Number(value.replace(",", ".")) },
  };
  const preview = describeConstraint(type, input.config);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = constraintCreateSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error.issues));
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }

    setSaving(true);
    const result = await apiRequest(
      editing ? `/api/admin/constraints/${editing.id}` : "/api/admin/constraints",
      { method: editing ? "PATCH" : "POST", body: input }
    );
    setSaving(false);

    if (!result.ok) {
      if (result.field === "config" || result.field === "workPointId") {
        setErrors({ [result.field]: result.error });
      } else {
        setFormError(result.error);
      }
      return;
    }

    toast.success(editing ? "Regula a fost actualizată." : "Regula a fost adăugată.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={state.open}
      onOpenChange={(next) => {
        if (!saving) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Editează regula" : "Adaugă regulă"}</DialogTitle>
          <DialogDescription>
            Regula se aplică cererilor depuse de acum înainte. Cererile existente rămân cum
            sunt.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} noValidate onSubmit={onSubmit} className="grid gap-4">
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <FormField
            id="rule-type"
            label="Tip regulă"
            hint={editing ? "Tipul nu se schimbă; pentru alt tip adaugă o regulă nouă." : undefined}
          >
            {(field) => (
              <NativeSelect
                {...field}
                value={type}
                disabled={saving || editing !== null}
                onChange={(event) => changeType(event.target.value as ConstraintType)}
              >
                {CONSTRAINT_TYPE_ORDER.map((option) => (
                  <option key={option} value={option}>
                    {CONSTRAINT_TYPES[option].label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <p className="-mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            {info.description}
          </p>

          <FormField
            id="rule-value"
            label={info.field.label}
            error={errors.config}
          >
            {(field) =>
              info.field.key === "month" ? (
                <NativeSelect
                  {...field}
                  value={value}
                  disabled={saving}
                  className="sm:max-w-56"
                  onChange={(event) => {
                    setValue(event.target.value);
                    setErrors({});
                  }}
                >
                  {MONTH_NAMES.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    {...field}
                    inputMode="numeric"
                    autoComplete="off"
                    value={value}
                    disabled={saving}
                    className="w-24"
                    onChange={(event) => {
                      setValue(event.target.value);
                      setErrors({});
                    }}
                  />
                  <span className="text-sm text-muted-foreground">{info.field.unit}</span>
                </div>
              )
            }
          </FormField>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Se aplică</legend>
            {(
              [
                { value: "GLOBAL", label: "Tuturor angajaților", icon: Globe },
                { value: "WORK_POINT", label: "Doar unui punct de lucru", icon: MapPin },
              ] as const
            ).map((option) => {
              const disabled = saving || (option.value === "WORK_POINT" && noWorkPoints);
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                    scope === option.value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    disabled && "cursor-not-allowed opacity-50"
                  )}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={option.value}
                    checked={scope === option.value}
                    disabled={disabled}
                    onChange={() => {
                      setScope(option.value);
                      setErrors({});
                    }}
                    className="size-4 accent-primary"
                  />
                  <option.icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  {option.label}
                </label>
              );
            })}
            {noWorkPoints ? (
              <p className="text-xs text-muted-foreground">
                Nu există puncte de lucru active.
              </p>
            ) : null}
          </fieldset>

          {scope === "WORK_POINT" ? (
            <FormField id="rule-work-point" label="Punct de lucru" error={errors.workPointId}>
              {(field) => (
                <NativeSelect
                  {...field}
                  value={workPointId}
                  disabled={saving}
                  onChange={(event) => {
                    setWorkPointId(event.target.value);
                    setErrors({});
                  }}
                >
                  <option value="">Alege punctul de lucru</option>
                  {workPointOptions.map((workPoint) => (
                    <option key={workPoint.id} value={workPoint.id}>
                      {workPoint.active ? workPoint.name : `${workPoint.name} (inactiv)`}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          ) : null}

          {preview ? (
            <p className="text-sm" aria-live="polite">
              <span className="text-muted-foreground">Regula: </span>
              <span className="font-medium">{preview}</span>
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={saving} />}>
              Anulează
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {editing ? "Salvează" : "Adaugă regula"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RuleItem({
  rule,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  rule: ConstraintRow;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const summary = describeConstraint(rule.type, rule.config);
  const ScopeIcon = rule.scope === "GLOBAL" ? Globe : MapPin;
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className={cn("font-medium", !rule.active && "text-muted-foreground")}>
          {summary ?? "Valoare invalidă: editează regula"}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ScopeIcon aria-hidden="true" className="size-3.5" />
            {scopeLabel(rule)}
          </span>
          {rule.active ? (
            <Badge variant="outline">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
              Activă
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground/60" />
              Inactivă
            </Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
          <Pencil aria-hidden="true" />
          Editează
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggle} disabled={busy}>
          {busy ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : rule.active ? (
            <PowerOff aria-hidden="true" />
          ) : (
            <Power aria-hidden="true" />
          )}
          {rule.active ? "Dezactivează" : "Activează"}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Șterge regula"
          title="Șterge regula"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

export function ConstraintsAdmin({
  constraints,
  workPoints,
}: {
  constraints: ConstraintRow[];
  workPoints: WorkPoint[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    key: 0,
    editing: null,
    type: "MIN_NOTICE_DAYS",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ConstraintRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function openDialog(type: ConstraintType, editing: ConstraintRow | null = null) {
    setDialog((current) => ({ open: true, key: current.key + 1, editing, type }));
  }

  async function toggle(rule: ConstraintRow) {
    setBusyId(rule.id);
    const result = await apiRequest(`/api/admin/constraints/${rule.id}`, {
      method: "PATCH",
      body: { active: !rule.active },
    });
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(rule.active ? "Regula a fost dezactivată." : "Regula a fost activată.");
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) {
      return;
    }
    setDeleteBusy(true);
    const result = await apiRequest(`/api/admin/constraints/${deleting.id}`, {
      method: "DELETE",
    });
    setDeleteBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDeleteOpen(false);
    toast.success("Regula a fost ștearsă.");
    router.refresh();
  }

  const activeCount = constraints.filter((rule) => rule.active).length;

  return (
    <>
      <PageHeader
        title="Reguli"
        description={
          constraints.length > 0
            ? `${activeCount} din ${constraints.length} reguli sunt active.`
            : "Condițiile verificate la fiecare cerere de concediu."
        }
        actions={
          <Button onClick={() => openDialog("MIN_NOTICE_DAYS")}>
            <Plus aria-hidden="true" />
            Adaugă regulă
          </Button>
        }
      />

      <Alert>
        <Info aria-hidden="true" />
        <AlertDescription>
          Toate cererile de concediu ajung la tine spre aprobare; niciuna nu se aprobă automat.
          Regulile nu resping cereri: când o cerere încalcă o regulă activă, angajatul vede motivul
          la depunere, iar tu îl vezi ca atenționare lângă cerere.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {CONSTRAINT_TYPE_ORDER.map((type) => {
          const info = CONSTRAINT_TYPES[type];
          const Icon = TYPE_ICONS[type];
          const rules = constraints.filter((rule) => rule.type === type);
          return (
            <Card key={type} className="gap-0 py-0">
              <CardHeader className={cn("py-4", rules.length > 0 && "border-b")}>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  {info.label}
                </CardTitle>
                <CardDescription className="max-w-3xl">{info.description}</CardDescription>
                <CardAction>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Adaugă regulă: ${info.label}`}
                    onClick={() => openDialog(type)}
                  >
                    <Plus aria-hidden="true" />
                    <span className="hidden sm:inline">Adaugă</span>
                  </Button>
                </CardAction>
              </CardHeader>
              {rules.length > 0 ? (
                <ul className="divide-y">
                  {rules.map((rule) => (
                    <RuleItem
                      key={rule.id}
                      rule={rule}
                      busy={busyId === rule.id}
                      onEdit={() => openDialog(rule.type, rule)}
                      onToggle={() => toggle(rule)}
                      onDelete={() => {
                        setDeleting(rule);
                        setDeleteOpen(true);
                      }}
                    />
                  ))}
                </ul>
              ) : null}
            </Card>
          );
        })}
      </div>

      <RuleDialog
        key={dialog.key}
        state={dialog}
        workPoints={workPoints}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!deleteBusy) {
            setDeleteOpen(next);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ștergi regula?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `„${describeConstraint(deleting.type, deleting.config) ?? CONSTRAINT_TYPES[deleting.type].label}” (${scopeLabel(deleting)}) nu se va mai aplica cererilor noi. Dacă vrei doar s-o oprești temporar, dezactiveaz-o.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Anulează</AlertDialogCancel>
            <Button variant="destructive" disabled={deleteBusy} onClick={confirmDelete}>
              {deleteBusy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Șterge
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
