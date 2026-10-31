"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { SettingRow, Switch } from "@neoboard/components";

/** Behavior → Write mode. The caller shows it only to a user with `canWrite`. */
export function WriteModeSection() {
  const allowWrites = useWidgetEditorStore((s) => s.allowWrites);
  const setAllowWrites = useWidgetEditorStore((s) => s.setAllowWrites);
  return (
    <SettingRow
      label="Enable write mode"
      htmlFor="allow-writes"
      help={
        allowWrites
          ? "This widget can execute write queries. The server still requires your account to have write permission."
          : "Needs the can_write permission."
      }
      compact
    >
      <Switch
        stateLabel
        id="allow-writes"
        checked={allowWrites}
        onCheckedChange={setAllowWrites}
      />
    </SettingRow>
  );
}
