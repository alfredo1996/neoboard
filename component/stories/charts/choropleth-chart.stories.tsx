import type { Meta, StoryObj } from "@storybook/react";
import { ChoroplethChart } from "@/charts/choropleth-chart";

const meta = {
  title: "Charts/ChoroplethChart",
  component: ChoroplethChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChoroplethChart>;

export default meta;
type Story = StoryObj<typeof meta>;

// Population data (millions) — names match world.geo.json
const populationData = [
  { name: "China", value: 1425 },
  { name: "India", value: 1408 },
  { name: "United States", value: 333 },
  { name: "Indonesia", value: 275 },
  { name: "Pakistan", value: 229 },
  { name: "Nigeria", value: 218 },
  { name: "Brazil", value: 215 },
  { name: "Bangladesh", value: 171 },
  { name: "Russia", value: 144 },
  { name: "Mexico", value: 130 },
  { name: "Japan", value: 125 },
  { name: "Germany", value: 83 },
  { name: "United Kingdom", value: 67 },
  { name: "France", value: 65 },
  { name: "Italy", value: 59 },
  { name: "Canada", value: 38 },
  { name: "Australia", value: 26 },
  { name: "Spain", value: 47 },
  { name: "South Korea", value: 52 },
  { name: "Turkey", value: 85 },
  { name: "Thailand", value: 72 },
  { name: "South Africa", value: 60 },
  { name: "Egypt", value: 104 },
  { name: "Colombia", value: 51 },
  { name: "Argentina", value: 46 },
  { name: "Kenya", value: 54 },
  { name: "Saudi Arabia", value: 36 },
  { name: "Poland", value: 38 },
  { name: "Ukraine", value: 44 },
  { name: "Peru", value: 33 },
  { name: "Vietnam", value: 98 },
  { name: "Philippines", value: 113 },
  { name: "Iran", value: 87 },
  { name: "Ethiopia", value: 120 },
  { name: "Dem. Rep. Congo", value: 99 },
  { name: "Myanmar", value: 54 },
  { name: "Tanzania", value: 63 },
  { name: "Algeria", value: 44 },
  { name: "Morocco", value: 37 },
  { name: "Sudan", value: 45 },
  { name: "Iraq", value: 42 },
  { name: "Afghanistan", value: 40 },
  { name: "Malaysia", value: 33 },
  { name: "Nepal", value: 30 },
  { name: "Ghana", value: 32 },
  { name: "Angola", value: 34 },
  { name: "Mozambique", value: 32 },
  { name: "Madagascar", value: 28 },
  { name: "Venezuela", value: 28 },
  { name: "Cameroon", value: 27 },
];

export const WorldPopulation: Story = {
  args: {
    data: populationData,
  },
};

const gdpData = [
  { name: "United States", value: 25500 },
  { name: "China", value: 17960 },
  { name: "Japan", value: 4230 },
  { name: "Germany", value: 4070 },
  { name: "India", value: 3390 },
  { name: "United Kingdom", value: 3070 },
  { name: "France", value: 2780 },
  { name: "Italy", value: 2010 },
  { name: "Brazil", value: 1920 },
  { name: "Canada", value: 2140 },
  { name: "Russia", value: 2240 },
  { name: "South Korea", value: 1670 },
  { name: "Australia", value: 1680 },
  { name: "Spain", value: 1400 },
  { name: "Mexico", value: 1320 },
  { name: "Indonesia", value: 1290 },
  { name: "Turkey", value: 905 },
  { name: "Saudi Arabia", value: 1060 },
  { name: "Netherlands", value: 990 },
  { name: "Switzerland", value: 870 },
  { name: "Poland", value: 688 },
  { name: "Argentina", value: 632 },
  { name: "Sweden", value: 585 },
  { name: "Norway", value: 580 },
  { name: "Nigeria", value: 472 },
  { name: "Thailand", value: 536 },
];

export const GDPByCountry: Story = {
  args: {
    data: gdpData,
    minColor: "#fff7bc",
    maxColor: "#d95f0e",
  },
};

export const WithLabels: Story = {
  args: {
    data: populationData.slice(0, 15),
    showLabels: true,
  },
};

export const CustomColors: Story = {
  args: {
    data: populationData,
    minColor: "#f7fcf5",
    maxColor: "#00441b",
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
};
