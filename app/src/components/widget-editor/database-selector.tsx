"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
} from "@neoboard/components";
import { useConnectionDatabases } from "@/hooks/use-connection-databases";

interface DatabaseSelectorProps {
  connectionId: string;
  database: string;
  onDatabaseChange: (database: string) => void;
}

export function DatabaseSelector({
  connectionId,
  database,
  onDatabaseChange,
}: DatabaseSelectorProps) {
  const { data, isLoading } = useConnectionDatabases(connectionId);
  const databases = data?.databases ?? [];

  if (isLoading || databases.length === 0) {
    return (
      <SettingRow label="Database">
        <p className="pt-2.5 text-meta text-muted-foreground">
          {isLoading ? "Loading databases..." : "No databases available"}
        </p>
      </SettingRow>
    );
  }

  return (
    <SettingRow
      label={
        <>
          Database{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </>
      }
      htmlFor="card-database"
    >
      <Select
        value={database || "__default__"}
        onValueChange={(v) => onDatabaseChange(v === "__default__" ? "" : v)}
      >
        <SelectTrigger id="card-database">
          <SelectValue placeholder="Connection default" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__default__">Connection default</SelectItem>
          {databases.map((db) => (
            <SelectItem key={db} value={db}>
              {db}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
}
