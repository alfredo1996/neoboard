import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  GuidedQueryBuilder,
  type GuidedQueryBuilderProps,
} from "@/components/composed/guided-query-builder";
import { EMPTY_PICKS, type GuidedPicks } from "@/lib/guided-query";

/** The story owns the picks so the controls respond as they do in the app. */
function Stateful(props: GuidedQueryBuilderProps) {
  const [picks, setPicks] = useState<GuidedPicks>(props.picks);
  return <GuidedQueryBuilder {...props} picks={picks} onChange={setPicks} />;
}

const neo4j = [
  { name: "Movie", fields: ["title", "released", "tagline"] },
  { name: "Person", fields: ["name", "born"] },
];

const postgres = [
  { name: "movies", fields: ["id", "title", "released"] },
  { name: "people", fields: ["id", "name"] },
];

const meta = {
  title: "Composed/GuidedQueryBuilder",
  component: GuidedQueryBuilder,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Pick a label or table, then fields, an optional filter and a limit. Every change is reported through `onChange`; the app turns the picks into query text with the connector's own builder and writes it into the editor (#1696).",
      },
    },
  },
  tags: ["autodocs"],
  args: { picks: EMPTY_PICKS, onChange: () => {} },
  render: (args) => <Stateful {...args} />,
  decorators: [
    (Story) => (
      <div className="w-[480px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GuidedQueryBuilder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neo4j: Story = {
  args: {
    sources: neo4j,
    picks: {
      source: "Movie",
      fields: ["title", "released"],
      filter: { field: "released", op: ">", value: "2000" },
      limit: 100,
    },
  },
};

export const PostgreSQL: Story = {
  args: { sources: postgres, picks: { ...EMPTY_PICKS, source: "movies" } },
};

export const NothingPicked: Story = {
  args: { sources: neo4j },
};

export const Loading: Story = {
  args: { sources: [], loading: true },
};

export const LoadError: Story = {
  args: { sources: [], error: "Connection refused" },
};

export const Empty: Story = {
  args: { sources: [] },
};
