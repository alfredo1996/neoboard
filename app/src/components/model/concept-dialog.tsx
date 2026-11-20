"use client";

import { useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  controlSizes,
  fieldBaseClasses,
} from "@neoboard/components";
import { randomId } from "@/lib/random-id";
import { useOntology } from "@/hooks/use-ontology";
import {
  useDeleteConcept,
  useSaveConcept,
  type Concept,
  type ConceptSide,
} from "@/hooks/use-concepts";
import { entityParentKey, slugParameter } from "@/lib/ontology/term-keys";

export interface ConceptConnection {
  readonly id: string;
  readonly name: string;
}

type Side = Pick<ConceptSide, "connectionId" | "entityKey" | "keyPropertyKey">;

/** A side being edited, keyed apart so a removal keeps the others' choices. */
type DraftSide = Side & { uid: string };
const draft = (s: Side): DraftSide => ({ ...s, uid: randomId() });

const selectClass = `${fieldBaseClasses} ${controlSizes.default}`;

interface SideRowProps {
  readonly side: Side;
  readonly connections: readonly ConceptConnection[];
  readonly onChange: (side: Side) => void;
  readonly onRemove: () => void;
}

/**
 * One side: a connection, then an entity of it, then one of that entity's
 * properties. Only terms still in the database and not hidden are offered.
 */
function SideRow({ side, connections, onChange, onRemove }: SideRowProps) {
  const { data } = useOntology(side.connectionId);
  const terms = (data?.terms ?? []).filter((t) => !t.orphaned && !t.hidden);
  const entities = terms.filter((t) => t.kind === "entity");
  const keys = terms.filter(
    (t) =>
      t.kind === "property" && t.parentKey === entityParentKey(side.entityKey),
  );
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
      <select
        aria-label="Connection"
        className={selectClass}
        value={side.connectionId}
        onChange={(e) =>
          onChange({
            connectionId: e.target.value,
            entityKey: "",
            keyPropertyKey: "",
          })
        }
      >
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Entity"
        className={selectClass}
        value={side.entityKey}
        onChange={(e) =>
          onChange({ ...side, entityKey: e.target.value, keyPropertyKey: "" })
        }
      >
        <option value="">Select an entity</option>
        {entities.map((t) => (
          <option key={t.key} value={t.key}>
            {t.key}
          </option>
        ))}
      </select>
      <select
        aria-label="Key property"
        className={selectClass}
        value={side.keyPropertyKey}
        disabled={!side.entityKey}
        onChange={(e) => onChange({ ...side, keyPropertyKey: e.target.value })}
      >
        <option value="">Select a key property</option>
        {keys.map((t) => (
          <option key={t.key} value={t.key}>
            {t.key}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label="Remove side"
        onClick={onRemove}
      >
        ✕
      </Button>
    </div>
  );
}

export interface ConceptDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The concept to edit; none for a new one. */
  readonly concept?: Concept;
  readonly connections: readonly ConceptConnection[];
}

/** The body, mounted per open so its draft starts from the concept every time. */
function ConceptForm({
  concept,
  connections,
  onClose,
}: Readonly<{
  concept?: Concept;
  connections: readonly ConceptConnection[];
  onClose: () => void;
}>) {
  const save = useSaveConcept();
  const remove = useDeleteConcept();
  const [name, setName] = useState(concept?.name ?? "");
  const [parameter, setParameter] = useState(concept?.parameter ?? "");
  // An existing concept's parameter is already chosen: the name never moves it.
  const [touched, setTouched] = useState(Boolean(concept));
  const [description, setDescription] = useState(concept?.description ?? "");
  const [sides, setSides] = useState<DraftSide[]>(() =>
    (
      concept?.sides ?? [
        {
          connectionId: connections[0]?.id ?? "",
          entityKey: "",
          keyPropertyKey: "",
        },
      ]
    ).map(({ connectionId, entityKey, keyPropertyKey }) =>
      draft({ connectionId, entityKey, keyPropertyKey }),
    ),
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();

  const complete =
    name.trim() !== "" &&
    parameter !== "" &&
    sides.length > 0 &&
    sides.every((s) => s.connectionId && s.entityKey && s.keyPropertyKey);

  async function run(action: () => Promise<unknown>) {
    setError(undefined);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  const setSide = (uid: string, next: Side) =>
    setSides((all) => all.map((s) => (s.uid === uid ? { ...next, uid } : s)));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{concept ? "Edit concept" : "New concept"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" id="concept-name">
            <Input
              value={name}
              maxLength={200}
              placeholder="Customer"
              onChange={(e) => {
                setName(e.target.value);
                if (!touched) setParameter(slugParameter(e.target.value));
              }}
            />
          </Field>
          <Field
            label="Parameter"
            id="concept-parameter"
            help="Set by clicks and filters. Derived from the name."
          >
            <Input
              className="font-mono"
              value={parameter}
              placeholder="customer"
              onChange={(e) => {
                setTouched(true);
                setParameter(e.target.value);
              }}
            />
          </Field>
        </div>
        <Field label="Description" id="concept-description" optional>
          <Input
            value={description}
            maxLength={2000}
            placeholder="Someone who has bought from us"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-2">
          <p className="m-0 text-sm font-medium">Mapping</p>
          {sides.map((s) => (
            <SideRow
              key={s.uid}
              side={s}
              connections={connections}
              onChange={(next) => setSide(s.uid, next)}
              onRemove={() =>
                setSides((all) => all.filter((o) => o.uid !== s.uid))
              }
            />
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                // A concept may have several sides on one connection, so a new one starts on the last side's.
                setSides((all) => [
                  ...all,
                  draft({
                    connectionId:
                      all.at(-1)?.connectionId ?? connections[0]?.id ?? "",
                    entityKey: "",
                    keyPropertyKey: "",
                  }),
                ])
              }
            >
              Add side
            </Button>
          </div>
        </div>
        <p className="m-0 text-meta text-muted-foreground">
          Values travel exactly. The keys must hold the same values on every
          side: a click that sets <code>${parameter || "customer"}</code>{" "}
          filters each mapped key by that same value.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter>
        {concept &&
          (confirming ? (
            <Button
              type="button"
              variant="danger-confirm"
              className="mr-auto"
              disabled={remove.isPending}
              onClick={() => run(() => remove.mutateAsync(concept.id))}
            >
              Confirm delete
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          ))}
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!complete || save.isPending}
          onClick={() =>
            run(() =>
              save.mutateAsync({
                ...(concept && { id: concept.id }),
                name: name.trim(),
                parameter,
                description,
                sides: sides.map(
                  ({ connectionId, entityKey, keyPropertyKey }) => ({
                    connectionId,
                    entityKey,
                    keyPropertyKey,
                  }),
                ),
              }),
            )
          }
        >
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

/** Creates or edits a concept (#2484). */
export function ConceptDialog({
  open,
  onOpenChange,
  concept,
  connections,
}: ConceptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open && (
          <ConceptForm
            concept={concept}
            connections={connections}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
