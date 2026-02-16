import { Database } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface DataSourceOption {
  id: string;
  name: string;
  type?: string;
}

export interface DataSourcePickerProps {
  value?: string;
  onValueChange?: (id: string) => void;
  options: DataSourceOption[];
  placeholder?: string;
  className?: string;
}

function DataSourcePicker({
  value,
  onValueChange,
  options,
  placeholder = "Select data source",
  className,
}: DataSourcePickerProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("w-[220px]", className)}>
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder={placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <div className="flex items-center gap-2">
              <span>{option.name}</span>
              {option.type && (
                <span className="text-xs text-muted-foreground">
                  ({option.type})
                </span>
              )}
            </div>
          </SelectItem>
        ))}
        {options.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-2 px-2">
            No data sources
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

export { DataSourcePicker };
