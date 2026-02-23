"use client";

import { useState, useRef } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { DashboardPage } from "@/lib/db/schema";
import {
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@neoboard/components";
import { cn } from "@neoboard/components";

interface PageTabsProps {
  pages: DashboardPage[];
  activeIndex: number;
  editable?: boolean;
  onSelect: (index: number) => void;
  onAdd?: () => void;
  onRemove?: (index: number) => void;
  onRename?: (index: number, title: string) => void;
}

export function PageTabs({
  pages,
  activeIndex,
  editable = false,
  onSelect,
  onAdd,
  onRemove,
  onRename,
}: PageTabsProps) {
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startRename(index: number) {
    setRenamingIndex(index);
    setRenameValue(pages[index].title);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitRename() {
    if (renamingIndex !== null && renameValue.trim()) {
      onRename?.(renamingIndex, renameValue.trim());
    }
    setRenamingIndex(null);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") setRenamingIndex(null);
  }

  return (
    <div className="flex items-center gap-1 px-4 border-b bg-background overflow-x-auto">
      {pages.map((page, index) => (
        <div key={page.id} className="group flex items-center shrink-0">
          {renamingIndex === index ? (
            <Input
              ref={inputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKeyDown}
              className="h-8 w-32 text-sm px-2 my-1"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => onSelect(index)}
              className={cn(
                "h-9 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                index === activeIndex
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              )}
            >
              {page.title}
            </button>
          )}

          {editable && renamingIndex !== index && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 ml-0.5"
                  aria-label={`Page options for ${page.title}`}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => startRename(index)}>
                  <Pencil className="mr-2 h-3 w-3" />
                  Rename
                </DropdownMenuItem>
                {pages.length > 1 && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onRemove?.(index)}
                  >
                    <Trash2 className="mr-2 h-3 w-3" />
                    Delete page
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ))}

      {editable && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onAdd}
          aria-label="Add page"
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
