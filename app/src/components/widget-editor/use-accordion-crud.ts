import { useEffect, useRef, useState } from "react";

/**
 * Given previous item IDs, current item IDs, and currently open accordion items,
 * returns updated open items: auto-expands new items and removes stale IDs.
 */
export function computeOpenItems(
  prevIds: Set<string>,
  currentIds: string[],
  openItems: string[],
): string[] {
  const currentSet = new Set(currentIds);
  const newIds = currentIds.filter((id) => !prevIds.has(id));
  const cleaned = openItems.filter((id) => currentSet.has(id));
  return newIds.length > 0 ? [...cleaned, ...newIds] : cleaned;
}

export function addItemToList<T extends { id: string }>(
  items: T[],
  factory: () => T,
): T[] {
  return [...items, factory()];
}

export function removeItemFromList<T extends { id: string }>(
  items: T[],
  id: string,
): T[] {
  return items.filter((item) => item.id !== id);
}

export function updateItemInList<T extends { id: string }>(
  items: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export interface AccordionCrudReturn<T extends { id: string }> {
  openItems: string[];
  setOpenItems: (items: string[]) => void;
  addItem: (factory: () => T) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<T>) => void;
}

export function useAccordionCrud<T extends { id: string }>(
  items: T[],
  onItemsChange: (items: T[]) => void,
): AccordionCrudReturn<T> {
  const [openItems, setOpenItems] = useState<string[]>(() =>
    items.map((item) => item.id),
  );
  const prevIdsRef = useRef(new Set(items.map((item) => item.id)));

  useEffect(() => {
    const currentIds = items.map((item) => item.id);
    setOpenItems((prev) => computeOpenItems(prevIdsRef.current, currentIds, prev));
    prevIdsRef.current = new Set(currentIds);
  }, [items]);

  function addItem(factory: () => T) {
    onItemsChange(addItemToList(items, factory));
  }

  function removeItem(id: string) {
    onItemsChange(removeItemFromList(items, id));
  }

  function updateItem(id: string, patch: Partial<T>) {
    onItemsChange(updateItemInList(items, id, patch));
  }

  return { openItems, setOpenItems, addItem, removeItem, updateItem };
}
