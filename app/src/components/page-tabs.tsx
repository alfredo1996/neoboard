"use client";

import React, { useState, useRef } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  GripVertical,
} from "lucide-react";
import type { DashboardPage } from "@/lib/db/schema";
import {
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  ConfirmDialog,
  focusedMenuTrigger,
  cn,
} from "@neoboard/components";
import { pluralWidgets } from "@/lib/widget/plural-widgets";

interface PageTabsProps {
  pages: DashboardPage[];
  activeIndex: number;
  editable?: boolean;
  onSelect: (index: number) => void;
  onAdd?: () => void;
  onRemove?: (index: number) => void;
  onRename?: (index: number, title: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

export function PageTabs({
  pages,
  activeIndex,
  editable = false,
  onSelect,
  onAdd,
  onRemove,
  onRename,
  onReorder,
}: Readonly<PageTabsProps>) {
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // The page Delete page was asked on (#2055), and the menu button focus goes
  // back to. Kept after the dialog closes so its fade-out still names the
  // page; `confirmOpen` alone opens and closes it.
  const [deleteTarget, setDeleteTarget] = useState<{
    index: number;
    page: DashboardPage;
    returnFocusTo: HTMLElement | null;
  } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function requestDelete(index: number) {
    // An empty page takes nothing with it, so it goes without asking.
    if (pages[index].widgets.length === 0) {
      onRemove?.(index);
      return;
    }
    setDeleteTarget({
      index,
      page: pages[index],
      returnFocusTo: focusedMenuTrigger(),
    });
    setConfirmOpen(true);
  }

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

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

  const canDrag = editable && !!onReorder;
  // Absent when an imported layout has no pages.
  const activePage = pages[activeIndex];

  // Bound on every tab, so each handler checks `canDrag` itself: a view-mode
  // tab must not accept a drop.
  function handleDragStart(e: React.DragEvent, index: number) {
    if (!canDrag) return;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    if (!canDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex === null || dragIndex === index) {
      setDropTargetIndex(null);
      return;
    }
    setDropTargetIndex(index);
  }

  function handleDrop(e: React.DragEvent, index: number) {
    if (!canDrag) return;
    e.preventDefault();
    const from = Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!Number.isNaN(from) && from !== index) {
      onReorder?.(from, index);
    }
    setDragIndex(null);
    setDropTargetIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDropTargetIndex(null);
  }

  return (
    <div className="flex items-center gap-1 px-4 border-b bg-background shrink-0 overflow-x-auto">
      {/* A tablist may own only tabs (#2107): page options, the rename field
          and Add page sit after it, and act on the active page. */}
      <div role="tablist" className="flex items-center gap-1">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className={cn(
              "group flex items-center shrink-0",
              canDrag && dragIndex === index && "opacity-50",
              canDrag &&
                dropTargetIndex === index &&
                dragIndex !== null &&
                dragIndex !== index &&
                "border-l-2 border-primary",
            )}
            draggable={canDrag}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          >
            {canDrag && (
              <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab shrink-0" />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              data-state={index === activeIndex ? "active" : "inactive"}
              data-testid="page-tab"
              onClick={() => onSelect(index)}
              className={cn(
                "h-9 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                index === activeIndex
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground",
              )}
            >
              {page.title}
            </button>
          </div>
        ))}
      </div>

      {editable &&
        activePage &&
        (renamingIndex === null ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={`Page options for ${activePage.title}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => startRename(activeIndex)}>
                <Pencil className="mr-2 h-3 w-3" />
                Rename
              </DropdownMenuItem>
              {pages.length > 1 && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => requestDelete(activeIndex)}
                >
                  <Trash2 className="mr-2 h-3 w-3" />
                  Delete page
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Input
            ref={inputRef}
            aria-label={`Rename page ${pages[renamingIndex].title}`}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKeyDown}
            className="h-8 w-32 text-sm px-2 my-1"
            autoFocus
          />
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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${deleteTarget?.page.title ?? ""}"?`}
        description={`This deletes the page and its ${pluralWidgets(deleteTarget?.page.widgets.length ?? 0)}.`}
        confirmText="Delete"
        variant="destructive"
        returnFocusTo={deleteTarget?.returnFocusTo}
        onConfirm={() => {
          if (deleteTarget) onRemove?.(deleteTarget.index);
        }}
      />
    </div>
  );
}
