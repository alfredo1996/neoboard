import { chartOptionGroups } from "../chart-options-panel";
import type { ChartOptionGroupsProps } from "../chart-options-panel";
import { renderSection, SettingsGroupBlock } from "../chart-settings-panel";

const SECTIONS = ["content", "data", "style", "behavior"] as const;

/** Every option group of a chart type, in section order, as the editor draws them. */
export function OptionRows(props: Readonly<ChartOptionGroupsProps>) {
  const groups = chartOptionGroups(props);
  return (
    <div>
      {SECTIONS.flatMap((section) =>
        renderSection(groups, section, "").map(([name, nodes]) => (
          <SettingsGroupBlock key={name} name={name}>
            {nodes}
          </SettingsGroupBlock>
        )),
      )}
    </div>
  );
}
