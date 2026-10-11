"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  MapPin,
  MapPinPlus,
  MoreHorizontal,
  Pencil,
  Power,
  PowerOff,
  Trash2,
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActiveBadge, EmptyState, FormField, PageHeader } from "@/components/admin/admin-ui";
import { pluralRo } from "@/components/admin/format";
import { apiRequest, fieldErrorsFrom, omitKey } from "@/components/admin/form-utils";
import { workPointCreateSchema } from "@/lib/validators";
import { cn } from "@/lib/utils";

export type WorkPointRow = {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
  /** Angajați activi atribuiți. */
  activeEmployees: number;
  /** Toți utilizatorii legați, inclusiv dezactivați (blochează ștergerea). */
  linkedUsers: number;
  constraints: number;
};

type Confirmation = { kind: "toggle" | "delete"; workPoint: WorkPointRow };

function canDelete(workPoint: WorkPointRow) {
  return workPoint.linkedUsers === 0 && workPoint.constraints === 0;
}

function WorkPointDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = punct nou. */
  editing: WorkPointRow | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(editing?.name ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const input = { name, address };
    const parsed = workPointCreateSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error.issues));
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }

    setSaving(true);
    const result = await apiRequest(
      editing ? `/api/admin/work-points/${editing.id}` : "/api/admin/work-points",
      { method: editing ? "PATCH" : "POST", body: input }
    );
    setSaving(false);

    if (!result.ok) {
      if (result.field === "name" || result.field === "address") {
        setErrors({ [result.field]: result.error });
      } else {
        setFormError(result.error);
      }
      return;
    }

    toast.success(
      editing
        ? "Punctul de lucru a fost actualizat."
        : `Punctul de lucru „${parsed.data.name}” a fost adăugat.`
    );
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editează punctul de lucru" : "Adaugă punct de lucru"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Numele nou apare imediat la angajații și regulile acestui punct."
              : "După creare îl poți atribui angajaților și regulilor."}
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} noValidate onSubmit={onSubmit} className="grid gap-4">
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <FormField id="work-point-name" label="Nume" error={errors.name}>
            {(field) => (
              <Input
                {...field}
                name="name"
                value={name}
                disabled={saving}
                autoComplete="off"
                placeholder="ex. Farmacia Centrală"
                onChange={(event) => {
                  setName(event.target.value);
                  setErrors((current) => omitKey(current, "name"));
                }}
              />
            )}
          </FormField>
          <FormField
            id="work-point-address"
            label="Adresă"
            error={errors.address}
            hint="Opțional."
          >
            {(field) => (
              <Input
                {...field}
                name="address"
                value={address}
                disabled={saving}
                autoComplete="off"
                placeholder="ex. Str. Republicii 12, Brașov"
                onChange={(event) => {
                  setAddress(event.target.value);
                  setErrors((current) => omitKey(current, "address"));
                }}
              />
            )}
          </FormField>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={saving} />}>
              Anulează
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {editing ? "Salvează" : "Adaugă"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmployeesLink({ workPoint }: { workPoint: WorkPointRow }) {
  const label = pluralRo(workPoint.activeEmployees, "angajat activ", "angajați activi");
  if (workPoint.activeEmployees === 0) {
    return <span className="text-muted-foreground">{label}</span>;
  }
  return (
    <Link
      href={`/admin/utilizatori?punct=${workPoint.id}`}
      className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {label}
    </Link>
  );
}

function RowActions({
  workPoint,
  onEdit,
  onConfirm,
}: {
  workPoint: WorkPointRow;
  onEdit: () => void;
  onConfirm: (kind: Confirmation["kind"]) => void;
}) {
  const deletable = canDelete(workPoint);
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil aria-hidden="true" />
        Editează
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Alte acțiuni pentru ${workPoint.name}`}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => onConfirm("toggle")}>
            {workPoint.active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
            {workPoint.active ? "Dezactivează" : "Reactivează"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!deletable}
            onClick={() => onConfirm("delete")}
          >
            <Trash2 aria-hidden="true" />
            <span className="flex flex-col">
              Șterge
              {!deletable ? (
                <span className="text-xs text-muted-foreground">
                  Are angajați sau reguli legate
                </span>
              ) : null}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function WorkPointsAdmin({ workPoints }: { workPoints: WorkPointRow[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ open: boolean; editing: WorkPointRow | null; key: number }>(
    { open: false, editing: null, key: 0 }
  );
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, setWorking] = useState(false);

  function openDialog(editing: WorkPointRow | null) {
    // Cheie nouă la fiecare deschidere: formularul pornește de la valorile curente.
    setDialog((current) => ({ open: true, editing, key: current.key + 1 }));
  }

  function askConfirmation(kind: Confirmation["kind"], workPoint: WorkPointRow) {
    setConfirmation({ kind, workPoint });
    setConfirmOpen(true);
  }

  async function confirm() {
    if (!confirmation) {
      return;
    }
    const { kind, workPoint } = confirmation;
    setWorking(true);
    const result =
      kind === "delete"
        ? await apiRequest(`/api/admin/work-points/${workPoint.id}`, { method: "DELETE" })
        : await apiRequest(`/api/admin/work-points/${workPoint.id}`, {
            method: "PATCH",
            body: { active: !workPoint.active },
          });
    setWorking(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setConfirmOpen(false);
    toast.success(
      kind === "delete"
        ? `Punctul de lucru „${workPoint.name}” a fost șters.`
        : workPoint.active
          ? `Punctul de lucru „${workPoint.name}” a fost dezactivat.`
          : `Punctul de lucru „${workPoint.name}” a fost reactivat.`
    );
    router.refresh();
  }

  const activeCount = workPoints.filter((workPoint) => workPoint.active).length;
  const target = confirmation?.workPoint;

  return (
    <>
      <PageHeader
        title="Puncte de lucru"
        description={
          workPoints.length > 0
            ? `${pluralRo(workPoints.length, "punct de lucru", "puncte de lucru")}, dintre care ${pluralRo(activeCount, "activ", "active")}.`
            : "Locațiile firmei, la care sunt atribuiți angajații și regulile."
        }
        actions={
          <Button onClick={() => openDialog(null)}>
            <MapPinPlus aria-hidden="true" />
            Adaugă punct de lucru
          </Button>
        }
      />

      {workPoints.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={MapPin}
            title="Niciun punct de lucru"
            description="Adaugă locațiile firmei ca să poți grupa angajații și să setezi reguli pe locație."
            action={
              <Button onClick={() => openDialog(null)}>
                <MapPinPlus aria-hidden="true" />
                Adaugă punct de lucru
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Nume</TableHead>
                  <TableHead>Angajați</TableHead>
                  <TableHead>Reguli</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Acțiuni</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workPoints.map((workPoint) => (
                  <TableRow key={workPoint.id}>
                    <TableCell className="max-w-80 py-2.5 pl-4">
                      <div className="flex min-w-0 flex-col">
                        <span
                          className={cn(
                            "truncate font-medium",
                            !workPoint.active && "text-muted-foreground"
                          )}
                        >
                          {workPoint.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {workPoint.address || "Fără adresă"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <EmployeesLink workPoint={workPoint} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {workPoint.constraints > 0 ? (
                        <Link
                          href="/admin/reguli"
                          className="rounded-sm underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {pluralRo(workPoint.constraints, "regulă", "reguli")}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <ActiveBadge
                        active={workPoint.active}
                        activeLabel="Activ"
                        inactiveLabel="Inactiv"
                      />
                    </TableCell>
                    <TableCell className="pr-4">
                      <RowActions
                        workPoint={workPoint}
                        onEdit={() => openDialog(workPoint)}
                        onConfirm={(kind) => askConfirmation(kind, workPoint)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="divide-y md:hidden">
            {workPoints.map((workPoint) => (
              <li key={workPoint.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={cn("font-medium", !workPoint.active && "text-muted-foreground")}
                    >
                      {workPoint.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {workPoint.address || "Fără adresă"}
                    </p>
                  </div>
                  <ActiveBadge active={workPoint.active} />
                </div>
                <p className="text-sm">
                  <EmployeesLink workPoint={workPoint} />
                  <span className="text-muted-foreground">
                    {" · "}
                    {workPoint.constraints > 0
                      ? pluralRo(workPoint.constraints, "regulă", "reguli")
                      : "fără reguli"}
                  </span>
                </p>
                <RowActions
                  workPoint={workPoint}
                  onEdit={() => openDialog(workPoint)}
                  onConfirm={(kind) => askConfirmation(kind, workPoint)}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <WorkPointDialog
        key={dialog.key}
        open={dialog.open}
        editing={dialog.editing}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!working) {
            setConfirmOpen(next);
          }
        }}
      >
        <AlertDialogContent>
          {target && confirmation ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmation.kind === "delete"
                    ? `Ștergi „${target.name}”?`
                    : target.active
                      ? `Dezactivezi „${target.name}”?`
                      : `Reactivezi „${target.name}”?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmation.kind === "delete"
                    ? "Punctul de lucru nu are angajați sau reguli, deci va fi șters definitiv."
                    : target.active
                      ? `Nu va mai putea fi ales pentru angajați sau reguli noi. ${
                          target.activeEmployees === 1
                            ? "Angajatul activ rămâne atribuit"
                            : target.activeEmployees > 1
                              ? `Cei ${pluralRo(target.activeEmployees, "angajat activ", "angajați activi")} rămân atribuiți`
                              : "Atribuirile existente rămân"
                        }, iar regulile lui se aplică în continuare.`
                      : "Va putea fi ales din nou pentru angajați și reguli."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={working}>Anulează</AlertDialogCancel>
                <Button
                  variant={confirmation.kind === "delete" || target.active ? "destructive" : "default"}
                  disabled={working}
                  onClick={confirm}
                >
                  {working ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                  {confirmation.kind === "delete"
                    ? "Șterge"
                    : target.active
                      ? "Dezactivează"
                      : "Reactivează"}
                </Button>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
