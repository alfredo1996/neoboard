"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  Input,
  LoadingButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Tag,
  useToast,
} from "@neoboard/components";
import { PageHeader, SettingsSection } from "@neoboard/components/kit";
import { TriangleAlert } from "lucide-react";
import { unwrapResponse } from "@/lib/api/api-client";
import { SettingsTabs } from "../settings-tabs";
import {
  LEVELS,
  NUMBER_FIELDS,
  SCHEDULER_KEYS,
  SOURCE_LABEL,
  formatDuration,
  numberError,
  toShown,
  toStored,
  type NumberKey,
  type SystemData,
} from "./fields";

type Shown = string | boolean;

const SECTIONS = {
  sched: SCHEDULER_KEYS as string[],
  signup: ["REGISTRATION_ENABLED"],
  log: ["LOG_LEVEL"],
};
type SectionId = keyof typeof SECTIONS;

const isNumberKey = (key: string): key is NumberKey => key in NUMBER_FIELDS;

function fmt(key: string, shown: Shown): string {
  if (key === "QUERY_QUEUE_TIMEOUT_MS") return `${shown} s`;
  if (key === "QUERY_SHED_THRESHOLD") return `${shown}%`;
  if (key === "REGISTRATION_ENABLED") return shown ? "open" : "closed";
  return String(shown);
}

export default function SystemPage() {
  const { toast } = useToast();
  const [data, setData] = useState<SystemData | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [draft, setDraft] = useState<Record<string, Shown>>({});
  const [resetting, setResetting] = useState<Record<string, true>>({});
  const [saving, setSaving] = useState<SectionId | null>(null);

  const load = useCallback(() => {
    fetch("/api/settings")
      .then((r) =>
        // Try again would only hit 403 again: say who can see this instead.
        r.status === 403
          ? setDenied(true)
          : unwrapResponse<SystemData>(r).then(setData),
      )
      .catch(() => setFailed(true));
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  useEffect(load, []);

  /** The value in force, in the units the page shows. */
  function inForce(key: string): Shown {
    const v = data?.settings[key]?.value;
    if (isNumberKey(key)) return String(toShown(key, Number(v)));
    return v as Shown;
  }
  const current = (key: string): Shown =>
    key in draft ? draft[key] : inForce(key);
  const changed = (key: string) =>
    key in resetting ||
    (key in draft && String(draft[key]) !== String(inForce(key)));
  // Only rows the admin changed are judged: env may hold a value the page
  // would not accept as typed, and that must not block saving another row.
  // Max per user is also judged when Max concurrent moves under it.
  const errorOf = (key: string) => {
    if (!isNumberKey(key)) return "";
    const concurrent = String(current("QUERY_MAX_CONCURRENT"));
    if (changed(key)) return numberError(key, String(current(key)), concurrent);
    if (key === "QUERY_MAX_PER_USER" && changed("QUERY_MAX_CONCURRENT")) {
      return Number(current(key)) > Number(concurrent)
        ? `Can't be more than Max concurrent (${concurrent}).`
        : "";
    }
    return "";
  };

  function edit(key: string, value: Shown) {
    setDraft((d) => ({ ...d, [key]: value }));
    setResetting(({ [key]: _gone, ...rest }) => rest);
  }
  function reset(key: string) {
    const base = data?.settings[key]?.base.value;
    const shown = isNumberKey(key) ? String(toShown(key, Number(base))) : base;
    setDraft((d) => ({ ...d, [key]: shown as Shown }));
    setResetting((r) => ({ ...r, [key]: true }));
  }
  function cancel(section: SectionId) {
    const drop = <T,>(o: Record<string, T>) =>
      Object.fromEntries(
        Object.entries(o).filter(([k]) => !SECTIONS[section].includes(k)),
      );
    setDraft(drop);
    setResetting(drop as (o: Record<string, true>) => Record<string, true>);
  }

  async function save(section: SectionId) {
    const keys = SECTIONS[section].filter(changed);
    const changes: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in resetting) changes[key] = null;
      else if (isNumberKey(key)) {
        changes[key] = toStored(key, Number(draft[key]));
      } else changes[key] = draft[key];
    }
    setSaving(section);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      setData(await unwrapResponse<SystemData>(res));
      cancel(section);
      const names = keys.map((k) =>
        isNumberKey(k) ? NUMBER_FIELDS[k].label : labelOf(k),
      );
      toast({ title: `Saved: ${names.join(", ")}. It applies now.` });
    } catch (e) {
      toast({
        title: "Couldn't save",
        description: e instanceof Error ? e.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  }

  const sectionState = (section: SectionId) => ({
    dirty: SECTIONS[section].some(changed),
    invalid: SECTIONS[section].some((k) => errorOf(k)),
  });

  function footer(section: SectionId) {
    const { dirty, invalid } = sectionState(section);
    return (
      <>
        {dirty && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => cancel(section)}
          >
            Cancel
          </Button>
        )}
        <LoadingButton
          type="submit"
          loading={saving === section}
          loadingText="Saving..."
          disabled={!dirty || invalid || saving !== null}
        >
          Save
        </LoadingButton>
      </>
    );
  }

  function sourceTag(key: string) {
    const source = data?.settings[key]?.source ?? "default";
    return <Tag>{SOURCE_LABEL[source]}</Tag>;
  }

  function whoLine(key: string) {
    const s = data?.settings[key];
    if (!s) return null;
    if (s.source === "locked") {
      return (
        <>
          Locked by the deployment (<code>SETTINGS_LOCKED</code>).
        </>
      );
    }
    if (s.source === "env")
      return (
        <>
          From <code>{key}</code>.
        </>
      );
    if (s.source !== "database") return null;
    const baseShown = isNumberKey(key)
      ? String(toShown(key, Number(s.base.value)))
      : (s.base.value as Shown);
    const label = s.base.source === "env" ? "Use env value" : "Use default";
    const when = s.updatedAt
      ? new Date(s.updatedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;
    return (
      <>
        {s.updatedByName && when && `Set by ${s.updatedByName} on ${when}. `}
        {!(key in resetting) && (
          <Button type="button" variant="link" onClick={() => reset(key)}>
            {label} ({fmt(key, baseShown)})
          </Button>
        )}
      </>
    );
  }

  const meta = (key: string) => {
    const line = whoLine(key);
    return line ? (
      <p className="mt-1 text-xs text-muted-foreground">{line}</p>
    ) : null;
  };

  function numberRow(key: NumberKey) {
    const f = NUMBER_FIELDS[key];
    const locked = data?.settings[key]?.source === "locked";
    return (
      <div key={key}>
        <Field
          label={
            <span className="inline-flex items-center gap-2">
              {f.label}
              {sourceTag(key)}
            </span>
          }
          help={f.help}
          error={errorOf(key) || undefined}
          id={`f-${key}`}
        >
          <div className="flex items-center gap-2">
            <Input
              className="w-28"
              inputMode="numeric"
              value={String(current(key))}
              disabled={locked}
              onChange={(e) => edit(key, e.target.value)}
            />
            {f.unit && (
              <span className="text-sm text-muted-foreground">{f.unit}</span>
            )}
          </div>
        </Field>
        {meta(key)}
      </div>
    );
  }

  function body() {
    if (denied) {
      return (
        <Alert role="alert">
          <AlertDescription>
            Only admins can see system settings.
          </AlertDescription>
        </Alert>
      );
    }
    if (failed) {
      return (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            <b>Couldn&apos;t load the system settings.</b> Nothing was changed.{" "}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFailed(false);
                load();
              }}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    if (!data) {
      return (
        <div data-testid="system-loading" className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    }
    const open = current("REGISTRATION_ENABLED") === true;
    const regLocked = data.settings.REGISTRATION_ENABLED.source === "locked";
    const logLocked = data.settings.LOG_LEVEL.source === "locked";
    const submit =
      (section: SectionId) => (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const { dirty, invalid } = sectionState(section);
        if (dirty && !invalid) void save(section);
      };
    return (
      <>
        <form onSubmit={submit("sched")} aria-label="Query scheduler">
          <SettingsSection
            title="Query scheduler"
            description="How many queries each connection runs at once and how long they wait. A change applies to the next query; running queries finish."
            footer={footer("sched")}
          >
            {SCHEDULER_KEYS.map(numberRow)}
          </SettingsSection>
        </form>

        <form onSubmit={submit("signup")} aria-label="Sign-up">
          <SettingsSection
            title="Sign-up"
            description="Whether people can create their own account on the sign-in page."
            footer={footer("signup")}
          >
            <Field
              label={
                <span className="inline-flex items-center gap-2">
                  Sign-up
                  {sourceTag("REGISTRATION_ENABLED")}
                </span>
              }
              labelsControl={false}
              id="f-REGISTRATION_ENABLED"
            >
              <Switch
                stateLabel
                aria-labelledby="f-REGISTRATION_ENABLED-label"
                checked={open}
                disabled={regLocked}
                onCheckedChange={(v) => edit("REGISTRATION_ENABLED", v)}
              />
            </Field>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              When open, anyone who can reach this address can create an
              account. New accounts get the creator role.
            </p>
            {meta("REGISTRATION_ENABLED")}
          </SettingsSection>
        </form>

        <form onSubmit={submit("log")} aria-label="Logging">
          <SettingsSection
            title="Logging"
            description="What the server writes to its log. Other log options stay in the deployment's environment."
            footer={footer("log")}
          >
            <Field
              label={
                <span className="inline-flex items-center gap-2">
                  Log level
                  {sourceTag("LOG_LEVEL")}
                </span>
              }
              help="How much the server writes to its log. Debug and trace are for troubleshooting."
              id="f-LOG_LEVEL"
            >
              <Select
                value={String(current("LOG_LEVEL"))}
                disabled={logLocked}
                onValueChange={(v) => edit("LOG_LEVEL", v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {meta("LOG_LEVEL")}
          </SettingsSection>
        </form>

        <SettingsSection
          title="Session"
          description="How long a sign-in lasts."
        >
          <div>
            <p className="flex items-center gap-2 text-sm">
              <span className="font-medium">Session length</span>
              <Tag>
                {data.sessionMaxAge.source === "env" ? "From env" : "Default"}
              </Tag>
            </p>
            <p className="mt-1 text-sm">
              {formatDuration(data.sessionMaxAge.seconds)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Set by the deployment (<code>SESSION_MAX_AGE</code>). It
              can&apos;t be changed here.
            </p>
          </div>
        </SettingsSection>
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        breadcrumb={[{ label: "Settings" }, { label: "System" }]}
        title="System"
        meta="Policy for this deployment. Admins only."
        tabs={<SettingsTabs />}
      />
      <div className="flex-1 space-y-4 bg-page-ground p-4 md:p-7">{body()}</div>
    </div>
  );
}

function labelOf(key: string): string {
  return key === "REGISTRATION_ENABLED" ? "Sign-up" : "Log level";
}
