"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
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

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">Database</Label>
        <p className="text-xs text-muted-foreground">Loading databases...</p>
      </div>
    );
  }

  if (databases.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="card-database" className="text-xs">
        Database
      </Label>
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
    </div>
  );
}
