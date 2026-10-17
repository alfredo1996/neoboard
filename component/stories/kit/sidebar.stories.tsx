import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, within } from "storybook/test";
import {
  Database,
  LayoutDashboard,
  Library,
  Settings,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/kit/app-shell";
import { FilterLine } from "@/components/kit/filter-line";
import { PageHeader } from "@/components/kit/page-header";
import { Sidebar } from "@/components/kit/sidebar";
import { Stat } from "@/components/kit/stat";

type Args = {
  rail: boolean;
  showAdminGroup: boolean;
  withAccount: boolean;
  activeItem: string;
};

const icon = (I: typeof Users) => <I className="h-4 w-4" />;

function Demo({ rail, showAdminGroup, withAccount, activeItem }: Args) {
  const [theme, setTheme] = useState("system");
  const select = () => {};
  return (
    <div className="h-[560px]" key={String(rail)}>
      <AppShell
        className="h-full"
        sidebar={
          <Sidebar
            defaultCollapsed={rail}
            groups={[
              {
                label: "Workspace",
                items: [
                  {
                    id: "d",
                    label: "Dashboards",
                    icon: icon(LayoutDashboard),
                    active: activeItem === "d",
                    onSelect: select,
                  },
                  {
                    id: "c",
                    label: "Connections",
                    icon: icon(Database),
                    active: activeItem === "c",
                    onSelect: select,
                  },
                  {
                    id: "w",
                    label: "Widget library",
                    icon: icon(Library),
                    active: activeItem === "w",
                    onSelect: select,
                  },
                ],
              },
              ...(showAdminGroup
                ? [
                    {
                      label: "Admin",
                      showLabel: true,
                      items: [
                        {
                          id: "u",
                          label: "Users",
                          icon: icon(Users),
                          active: activeItem === "u",
                          onSelect: select,
                        },
                        {
                          id: "s",
                          label: "Settings",
                          icon: icon(Settings),
                          active: activeItem === "s",
                          onSelect: select,
                        },
                      ],
                    },
                  ]
                : []),
            ]}
            account={
              withAccount
                ? {
                    name: "Alice Demo",
                    detail: "admin",
                    onProfile: select,
                    onSignOut: select,
                    theme: {
                      value: theme,
                      options: [
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                        { value: "system", label: "System" },
                      ],
                      onChange: setTheme,
                    },
                  }
                : undefined
            }
          />
        }
      >
        <PageHeader
          breadcrumb={[{ label: "Dashboards" }]}
          title="Dashboards"
          meta="8 dashboards · 3 shared with you"
        />
        <div className="space-y-3.5 bg-page-ground p-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Dashboards" value="8" />
            <Stat label="Widgets" value="356" />
            <Stat label="Connections" value="4" />
          </div>
          <FilterLine
            filters={[{ id: "o", label: "Owner", value: "you" }]}
            onRemove={select}
            onReset={select}
          />
        </div>
      </AppShell>
    </div>
  );
}

const meta = {
  title: "Kit/Sidebar",
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    rail: { control: "boolean", description: "Collapse to the 56 px rail" },
    showAdminGroup: { control: "boolean" },
    withAccount: { control: "boolean" },
    activeItem: {
      control: "select",
      options: ["d", "c", "w", "u", "s"],
    },
  },
  args: {
    rail: false,
    showAdminGroup: true,
    withAccount: true,
    activeItem: "d",
  },
  render: (args: Args) => <Demo {...args} />,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

// The play functions pin the width: at a phone-width viewport the "expanded"
// story would silently render the rail and axe would never see the labels.
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();
  },
};
export const Rail: Story = { args: { rail: true } };
export const ExpandedDark: Story = { globals: { theme: "dark" } };
export const RailDark: Story = {
  args: { rail: true },
  globals: { theme: "dark" },
};
