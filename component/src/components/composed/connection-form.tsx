import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingButton } from "./loading-button";
import { cn } from "@/lib/utils";

export interface ConnectionFieldConfig {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "select";
  placeholder?: string;
  options?: string[];
  defaultValue?: string;
  required?: boolean;
  width?: string;
}

export interface ConnectionFormProps {
  fields: ConnectionFieldConfig[];
  defaultValues?: Record<string, string>;
  onSubmit?: (values: Record<string, string>) => void;
  onTest?: (values: Record<string, string>) => void;
  testing?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  testLabel?: string;
  className?: string;
}

export const neo4jConnectionFields: ConnectionFieldConfig[] = [
  {
    name: "protocol",
    label: "Protocol",
    type: "select",
    options: ["neo4j", "neo4j+s", "neo4j+ssc", "bolt", "bolt+s", "bolt+ssc"],
    defaultValue: "neo4j",
    width: "w-[140px]",
  },
  {
    name: "host",
    label: "Host",
    type: "text",
    placeholder: "localhost",
    defaultValue: "localhost",
  },
  {
    name: "port",
    label: "Port",
    type: "text",
    placeholder: "7687",
    defaultValue: "7687",
    width: "w-[80px]",
  },
  {
    name: "database",
    label: "Database",
    type: "text",
    placeholder: "neo4j (default)",
  },
  {
    name: "username",
    label: "Username",
    type: "text",
    placeholder: "neo4j",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "••••••••",
  },
];

export const postgresConnectionFields: ConnectionFieldConfig[] = [
  {
    name: "host",
    label: "Host",
    type: "text",
    placeholder: "localhost",
    defaultValue: "localhost",
  },
  {
    name: "port",
    label: "Port",
    type: "text",
    placeholder: "5432",
    defaultValue: "5432",
    width: "w-[80px]",
  },
  {
    name: "database",
    label: "Database",
    type: "text",
    placeholder: "mydb",
    required: true,
  },
  {
    name: "schema",
    label: "Schema",
    type: "text",
    placeholder: "public",
    defaultValue: "public",
    width: "w-[120px]",
  },
  {
    name: "username",
    label: "Username",
    type: "text",
    placeholder: "postgres",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "••••••••",
  },
  {
    name: "sslmode",
    label: "SSL Mode",
    type: "select",
    options: ["disable", "require", "verify-ca", "verify-full"],
    defaultValue: "disable",
    width: "w-[140px]",
  },
];

function ConnectionForm({
  fields,
  defaultValues,
  onSubmit,
  onTest,
  testing = false,
  submitting = false,
  submitLabel = "Connect",
  testLabel = "Test Connection",
  className,
}: ConnectionFormProps) {
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.name] =
        defaultValues?.[field.name] ?? field.defaultValue ?? "";
    }
    return initial;
  });

  const update = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(values);
  };

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="flex flex-wrap gap-2">
        {fields.map((field) => (
          <div
            key={field.name}
            className={cn(
              "space-y-1.5",
              field.width ? field.width : "flex-1 min-w-[120px]",
            )}
          >
            <Label htmlFor={field.name} className="text-xs">
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {field.type === "select" ? (
              <Select
                value={values[field.name]}
                onValueChange={(v) => update(field.name, v)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={field.name}
                type={field.type}
                value={values[field.name]}
                onChange={(e) => update(field.name, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        {onTest && (
          <LoadingButton
            type="button"
            variant="outline"
            loading={testing}
            loadingText="Testing..."
            onClick={() => onTest(values)}
          >
            {testLabel}
          </LoadingButton>
        )}
        <LoadingButton
          type="submit"
          loading={submitting}
          loadingText="Connecting..."
          className="ml-auto"
        >
          {submitLabel}
        </LoadingButton>
      </div>
    </form>
  );
}

export { ConnectionForm };
