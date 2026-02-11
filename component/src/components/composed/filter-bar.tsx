import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FilterDef {
  key: string;
  label: string;
  type: "text" | "select";
  options?: { value: string; label: string }[];
}

export interface FilterBarProps {
  filters: FilterDef[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onClear?: () => void;
  className?: string;
}

function FilterBar({
  filters,
  values,
  onChange,
  onClear,
  className,
}: FilterBarProps) {
  const [addOpen, setAddOpen] = React.useState(false);

  const activeFilters = Object.entries(values).filter(([, v]) => v !== "");
  const availableFilters = filters.filter((f) => !(f.key in values) || values[f.key] === "");

  const handleAdd = (key: string, value: string) => {
    onChange({ ...values, [key]: value });
    setAddOpen(false);
  };

  const handleRemove = (key: string) => {
    const next = { ...values };
    delete next[key];
    onChange(next);
  };

  const getFilterLabel = (key: string) => {
    return filters.find((f) => f.key === key)?.label ?? key;
  };

  const getFilterDisplayValue = (key: string, value: string) => {
    const filter = filters.find((f) => f.key === key);
    if (filter?.type === "select" && filter.options) {
      return filter.options.find((o) => o.value === value)?.label ?? value;
    }
    return value;
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {activeFilters.map(([key, value]) => (
        <Badge key={key} variant="secondary" className="gap-1 pr-1 font-normal">
          <span className="text-muted-foreground">{getFilterLabel(key)}:</span>
          <span>{getFilterDisplayValue(key, value)}</span>
          <button
            type="button"
            onClick={() => handleRemove(key)}
            className="ml-1 rounded-full p-0.5 hover:bg-muted"
          >
            <X className="h-3 w-3" />
            <span className="sr-only">Remove {getFilterLabel(key)} filter</span>
          </button>
        </Badge>
      ))}

      {availableFilters.length > 0 && (
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1">
              <Plus className="h-3 w-3" />
              Add filter
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-3" align="start">
            {availableFilters.map((filter) => (
              <FilterInput key={filter.key} filter={filter} onApply={handleAdd} />
            ))}
          </PopoverContent>
        </Popover>
      )}

      {activeFilters.length > 0 && onClear && (
        <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={onClear}>
          Clear all
        </Button>
      )}
    </div>
  );
}

function FilterInput({
  filter,
  onApply,
}: {
  filter: FilterDef;
  onApply: (key: string, value: string) => void;
}) {
  const [value, setValue] = React.useState("");

  if (filter.type === "select" && filter.options) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{filter.label}</label>
        <Select onValueChange={(v) => onApply(filter.key, v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder={`Select ${filter.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{filter.label}</label>
      <div className="flex gap-1">
        <Input
          className="h-8"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Filter by ${filter.label.toLowerCase()}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value) onApply(filter.key, value);
          }}
        />
        <Button
          size="sm"
          className="h-8"
          onClick={() => { if (value) onApply(filter.key, value); }}
          disabled={!value}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

export { FilterBar };
