import * as React from "react";
import { Play, Loader2, RotateCcw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface QueryEditorProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onRun?: (query: string) => void;
  running?: boolean;
  history?: string[];
  placeholder?: string;
  language?: string;
  className?: string;
  /** When provided, a hint for the run-and-save keyboard shortcut is displayed next to the Run button. */
  runAndSaveHint?: boolean;
}

function QueryEditor({
  value,
  defaultValue = "",
  onChange,
  onRun,
  running = false,
  history,
  placeholder = "Enter your query...",
  language = "Cypher",
  className,
  runAndSaveHint = false,
}: QueryEditorProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const currentValue = value ?? internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (value === undefined) setInternalValue(newValue);
    onChange?.(newValue);
  };

  const handleRun = () => {
    if (currentValue.trim() && !running) {
      onRun?.(currentValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // CMD/Ctrl+Enter runs the query. Exclude Shift so CMD+Shift+Enter is reserved for
    // the run-and-save shortcut handled at the modal level.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      handleRun();
    }
  };

  const handleHistorySelect = (query: string) => {
    if (value === undefined) setInternalValue(query);
    onChange?.(query);
  };

  const handleClear = () => {
    if (value === undefined) setInternalValue("");
    onChange?.("");
    textareaRef.current?.focus();
  };

  return (
    <div className={cn("rounded-lg border bg-muted/30", className)}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{language}</span>
          {history && history.length > 0 && (
            <Select onValueChange={handleHistorySelect}>
              <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent text-xs text-muted-foreground hover:text-foreground">
                <Clock className="h-3 w-3" />
                <SelectValue placeholder="History" />
              </SelectTrigger>
              <SelectContent>
                {history.map((query, i) => (
                  <SelectItem key={i} value={query} className="text-xs font-mono">
                    {query.length > 60 ? query.slice(0, 60) + "..." : query}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleClear}
            disabled={!currentValue || running}
            aria-label="Clear query"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          {runAndSaveHint && (
            <span
              className="hidden sm:inline-flex items-center text-[10px] text-muted-foreground select-none mr-1"
              aria-label="Run and save shortcut: Command Shift Enter"
              title="Run & Save: ⌘⇧↵ / Ctrl+Shift+Enter"
            >
              <kbd className="font-mono">⌘⇧↵</kbd>
              <span className="ml-1">Run &amp; Save</span>
            </span>
          )}
          <Button
            size="sm"
            className="h-7 gap-1"
            onClick={handleRun}
            disabled={!currentValue.trim() || running}
            title="Run query (Ctrl+Enter / ⌘+Enter)"
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {running ? "Running" : "Run"}
          </Button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={currentValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent p-4 font-mono text-sm outline-none placeholder:text-muted-foreground/60 min-h-[120px]"
        spellCheck={false}
      />
    </div>
  );
}

export { QueryEditor };
