"use client";

import {
  useRef,
  useState,
  type MouseEventHandler,
  type RefObject,
} from "react";
import {
  Plus,
  Trash2,
  Shield,
  Globe,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  Button,
  Input,
  Badge,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  EmptyState,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  PasswordInput,
  Field,
} from "@neoboard/components";
import { PageHeader } from "@neoboard/components/kit";
import { SettingsTabs } from "../settings-tabs";
import { useSettingsCrumb } from "../settings-crumb";
import {
  useSsoProviders,
  useCreateSsoProvider,
  useDeleteSsoProvider,
} from "@/hooks/use-sso-providers";
import type {
  SsoProviderListItem,
  CreateSsoProviderInput,
} from "@/hooks/use-sso-providers";
import { FeatureGate } from "@/components/feature-gate";
import { EnterpriseRequiredEmptyState } from "@/components/enterprise-required-empty-state";
import { returnFocus } from "@/lib/return-focus";

// ---------------------------------------------------------------------------
// Add Provider Dialog
// ---------------------------------------------------------------------------

const EMPTY_FORM: CreateSsoProviderInput = {
  name: "",
  issuer: "",
  clientId: "",
  clientSecret: "",
  scopes: "openid profile email",
  autoProvision: true,
  defaultRole: "creator",
  enforceSso: false,
};

function AddProviderDialog({
  open,
  onClose,
  onCreated,
  onCloseAutoFocus,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onCloseAutoFocus: () => void;
}>) {
  const [form, setForm] = useState<CreateSsoProviderInput>(EMPTY_FORM);
  const [claimKey, setClaimKey] = useState("");
  const [adminValue, setAdminValue] = useState("");
  const [creatorValue, setCreatorValue] = useState("");
  const [readerValue, setReaderValue] = useState("");
  const createMutation = useCreateSsoProvider();

  const handleCreate = async () => {
    const claimMappings = claimKey.trim()
      ? {
          claimKey: claimKey.trim(),
          ...(adminValue.trim() && { adminValue: adminValue.trim() }),
          ...(creatorValue.trim() && { creatorValue: creatorValue.trim() }),
          ...(readerValue.trim() && { readerValue: readerValue.trim() }),
        }
      : undefined;

    await createMutation.mutateAsync({ ...form, claimMappings });
    onCreated();
    handleClose();
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setClaimKey("");
    setAdminValue("");
    setCreatorValue("");
    setReaderValue("");
    createMutation.reset();
    onClose();
  };

  const update = (field: keyof CreateSsoProviderInput, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const isValid =
    form.name.trim() &&
    form.issuer.trim() &&
    form.clientId.trim() &&
    form.clientSecret.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Add SSO Provider</DialogTitle>
          <DialogDescription>
            Configure an OIDC provider for single sign-on authentication.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Provider Details */}
          <Field label="Display Name" id="sso-name">
            <Input
              placeholder='e.g. "Company SSO" or "Okta"'
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </Field>

          <Field
            label="Issuer URL"
            id="sso-issuer"
            help="The OIDC discovery endpoint will be resolved from this URL."
          >
            <Input
              placeholder="https://idp.example.com"
              value={form.issuer}
              onChange={(e) => update("issuer", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Client ID" id="sso-client-id">
              <Input
                placeholder="client-id"
                value={form.clientId}
                onChange={(e) => update("clientId", e.target.value)}
              />
            </Field>
            <Field label="Client Secret" id="sso-client-secret">
              <PasswordInput
                placeholder="client-secret"
                value={form.clientSecret}
                onChange={(e) => update("clientSecret", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Scopes" id="sso-scopes">
            <Input
              placeholder="openid profile email"
              value={form.scopes ?? "openid profile email"}
              onChange={(e) => update("scopes", e.target.value)}
            />
          </Field>

          {/* Claim Mapping */}
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="text-sm font-medium">Role Claim Mapping</h4>
            <p className="text-xs text-muted-foreground">
              Map an IdP claim to NeoBoard roles. Leave empty to use the default
              role for all SSO users.
            </p>

            <Field label="IdP Claim Key" id="sso-claim-key">
              <Input
                placeholder='e.g. "groups" or "realm_access.roles"'
                value={claimKey}
                onChange={(e) => setClaimKey(e.target.value)}
              />
            </Field>

            {claimKey.trim() && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Admin" id="sso-admin-value">
                  <Input
                    placeholder="neoboard-admins"
                    value={adminValue}
                    onChange={(e) => setAdminValue(e.target.value)}
                    className="text-sm"
                  />
                </Field>
                <Field label="Creator" id="sso-creator-value">
                  <Input
                    placeholder="neoboard-editors"
                    value={creatorValue}
                    onChange={(e) => setCreatorValue(e.target.value)}
                    className="text-sm"
                  />
                </Field>
                <Field label="Reader" id="sso-reader-value">
                  <Input
                    placeholder="neoboard-viewers"
                    value={readerValue}
                    onChange={(e) => setReaderValue(e.target.value)}
                    className="text-sm"
                  />
                </Field>
              </div>
            )}
          </div>

          {/* Provisioning Options */}
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="text-sm font-medium">Provisioning</h4>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Auto-provision new users</p>
                <p className="text-xs text-muted-foreground">
                  Automatically create accounts for new SSO users.
                </p>
              </div>
              <Switch
                checked={form.autoProvision ?? true}
                onCheckedChange={(checked) => update("autoProvision", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Default role</p>
                <p className="text-xs text-muted-foreground">
                  Role assigned when no claim mapping matches.
                </p>
              </div>
              <Select
                value={form.defaultRole ?? "creator"}
                onValueChange={(v) => update("defaultRole", v)}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="creator">Creator</SelectItem>
                  <SelectItem value="reader">Reader</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Enforce SSO</p>
                <p className="text-xs text-muted-foreground">
                  Disable password login for non-admin users.
                </p>
              </div>
              <Switch
                checked={form.enforceSso ?? false}
                onCheckedChange={(checked) => update("enforceSso", checked)}
              />
            </div>
          </div>

          {createMutation.error && (
            <p className="text-sm text-destructive">
              {createMutation.error.message}
            </p>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!isValid || createMutation.isPending}
            >
              {createMutation.isPending ? "Saving..." : "Add Provider"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Provider Row
// ---------------------------------------------------------------------------

function ProviderRow({
  provider,
  onDelete,
  heading,
}: Readonly<{
  provider: SsoProviderListItem;
  onDelete: (id: string) => void;
  heading: RefObject<HTMLHeadingElement | null>;
}>) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The dialog has no Trigger: where focus goes when it closes (#2125).
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);

  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{provider.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">
        {provider.issuer}
      </td>
      <td className="px-4 py-3 text-sm">
        <Badge variant={provider.enabled ? "default" : "secondary"}>
          {provider.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {provider.defaultRole}
      </td>
      <td className="px-4 py-3 text-sm">
        {provider.enforceSso ? (
          <ToggleRight className="h-4 w-4 text-primary" />
        ) : (
          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant="danger"
          size="icon"
          onClick={(e) => {
            setReturnFocusTo(e.currentTarget);
            setConfirmOpen(true);
          }}
          aria-label={"Delete " + provider.name}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete SSO Provider"
          description={
            'Are you sure you want to delete "' +
            provider.name +
            '"? Users provisioned via this provider will keep their accounts but can no longer sign in with SSO.'
          }
          confirmText="Delete"
          variant="destructive"
          returnFocusTo={returnFocusTo}
          onConfirm={() => {
            // The row leaves once the list refetches: land on the heading.
            setReturnFocusTo(heading.current);
            onDelete(provider.id);
            setConfirmOpen(false);
          }}
        />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AuthenticationPage() {
  return (
    <FeatureGate
      feature="sso"
      fallback={
        <AuthenticationPageShell>
          <EnterpriseRequiredEmptyState feature="sso" />
        </AuthenticationPageShell>
      }
    >
      <AuthenticationPageContent />
    </FeatureGate>
  );
}

/** Header and tabs around the page body, so the fallback keeps the chrome. */
function AuthenticationPageShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settingsCrumb = useSettingsCrumb();
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        breadcrumb={[settingsCrumb, { label: "Authentication" }]}
        title="Authentication"
        tabs={<SettingsTabs />}
      />
      <div className="flex-1 bg-page-ground p-4 md:p-7">{children}</div>
    </div>
  );
}

function AuthenticationPageContent() {
  const [createOpen, setCreateOpen] = useState(false);
  // The dialog has no Trigger: where focus goes when it closes (#2146).
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);
  const { data: providers = [], isLoading } = useSsoProviders();
  const deleteMutation = useDeleteSsoProvider();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settingsCrumb = useSettingsCrumb();

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const openCreate: MouseEventHandler<HTMLButtonElement> = (e) => {
    setReturnFocusTo(e.currentTarget);
    setCreateOpen(true);
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        breadcrumb={[settingsCrumb, { label: "Authentication" }]}
        title="Authentication"
        titleRef={headingRef}
        meta="Configure single sign-on (SSO) providers for your organization."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Provider
          </Button>
        }
        tabs={<SettingsTabs />}
      />

      <div className="flex-1 space-y-4 bg-page-ground p-4 md:p-7">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {!isLoading && providers.length === 0 && (
          <EmptyState
            icon={<Shield className="h-8 w-8 text-muted-foreground" />}
            title="No SSO providers"
            description="Add an OIDC provider to enable single sign-on for your organization."
            action={
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Add Provider
              </Button>
            }
          />
        )}

        {!isLoading && providers.length > 0 && (
          <div className="rounded-lg border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Provider
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Issuer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Default Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    SSO Enforced
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    onDelete={handleDelete}
                    heading={headingRef}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddProviderDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          // The empty state and its button leave with the refetch, after the
          // close.
          if (providers.length === 0) setReturnFocusTo(headingRef.current);
        }}
        onCloseAutoFocus={() => returnFocus(returnFocusTo, headingRef.current)}
      />
    </div>
  );
}
