import type { Meta, StoryObj } from "@storybook/react";
import { SunburstChart } from "@/charts/sunburst-chart";

const meta = {
  title: "Charts/SunburstChart",
  component: SunburstChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SunburstChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const hierarchicalData = [
  {
    name: "Technology",
    children: [
      {
        name: "Frontend",
        children: [
          { name: "React", value: 40 },
          { name: "Vue", value: 20 },
          { name: "Angular", value: 15 },
        ],
      },
      {
        name: "Backend",
        children: [
          { name: "Node.js", value: 35 },
          { name: "Python", value: 30 },
          { name: "Java", value: 25 },
        ],
      },
      {
        name: "Database",
        children: [
          { name: "PostgreSQL", value: 30 },
          { name: "Neo4j", value: 20 },
          { name: "Redis", value: 15 },
        ],
      },
    ],
  },
  {
    name: "Business",
    children: [
      {
        name: "Sales",
        children: [
          { name: "Direct", value: 50 },
          { name: "Channel", value: 30 },
        ],
      },
      {
        name: "Marketing",
        children: [
          { name: "Digital", value: 40 },
          { name: "Events", value: 20 },
        ],
      },
    ],
  },
];

const flatData = [
  {
    name: "Documents",
    children: [
      { name: "Reports", value: 120 },
      { name: "Presentations", value: 85 },
      { name: "Spreadsheets", value: 65 },
      { name: "Images", value: 200 },
      { name: "Videos", value: 350 },
      { name: "Audio", value: 90 },
    ],
  },
];

export const Default: Story = {
  args: {
    data: hierarchicalData,
  },
};

export const FlatWithParent: Story = {
  args: {
    data: flatData,
  },
};

export const NoLabels: Story = {
  args: {
    data: hierarchicalData,
    showLabels: false,
  },
};

export const AscendingSort: Story = {
  args: {
    data: hierarchicalData,
    sort: "asc",
  },
};

export const DeepHierarchy: Story = {
  args: {
    data: [
      {
        name: "World",
        children: [
          {
            name: "North America",
            children: [
              {
                name: "United States",
                children: [
                  {
                    name: "California",
                    children: [
                      { name: "Los Angeles", value: 3900 },
                      { name: "San Francisco", value: 870 },
                      { name: "San Diego", value: 1400 },
                      { name: "San Jose", value: 1030 },
                    ],
                  },
                  {
                    name: "Texas",
                    children: [
                      { name: "Houston", value: 2300 },
                      { name: "Dallas", value: 1340 },
                      { name: "Austin", value: 960 },
                      { name: "San Antonio", value: 1530 },
                    ],
                  },
                  {
                    name: "New York",
                    children: [
                      { name: "New York City", value: 8300 },
                      { name: "Buffalo", value: 255 },
                      { name: "Rochester", value: 210 },
                    ],
                  },
                  {
                    name: "Florida",
                    children: [
                      { name: "Miami", value: 450 },
                      { name: "Orlando", value: 310 },
                      { name: "Tampa", value: 390 },
                      { name: "Jacksonville", value: 950 },
                    ],
                  },
                  {
                    name: "Illinois",
                    children: [
                      { name: "Chicago", value: 2700 },
                      { name: "Springfield", value: 115 },
                    ],
                  },
                ],
              },
              {
                name: "Canada",
                children: [
                  {
                    name: "Ontario",
                    children: [
                      { name: "Toronto", value: 2930 },
                      { name: "Ottawa", value: 1010 },
                    ],
                  },
                  {
                    name: "Quebec",
                    children: [
                      { name: "Montreal", value: 1780 },
                      { name: "Quebec City", value: 540 },
                    ],
                  },
                  {
                    name: "British Columbia",
                    children: [
                      { name: "Vancouver", value: 2580 },
                      { name: "Victoria", value: 390 },
                    ],
                  },
                ],
              },
              {
                name: "Mexico",
                children: [
                  { name: "Mexico City", value: 9200 },
                  { name: "Guadalajara", value: 1460 },
                  { name: "Monterrey", value: 1130 },
                ],
              },
            ],
          },
          {
            name: "Europe",
            children: [
              {
                name: "Western Europe",
                children: [
                  {
                    name: "United Kingdom",
                    children: [
                      { name: "London", value: 8980 },
                      { name: "Manchester", value: 550 },
                      { name: "Birmingham", value: 1140 },
                      { name: "Edinburgh", value: 525 },
                    ],
                  },
                  {
                    name: "France",
                    children: [
                      { name: "Paris", value: 2160 },
                      { name: "Lyon", value: 515 },
                      { name: "Marseille", value: 870 },
                    ],
                  },
                  {
                    name: "Germany",
                    children: [
                      { name: "Berlin", value: 3640 },
                      { name: "Munich", value: 1470 },
                      { name: "Hamburg", value: 1850 },
                      { name: "Frankfurt", value: 750 },
                    ],
                  },
                  {
                    name: "Netherlands",
                    children: [
                      { name: "Amsterdam", value: 870 },
                      { name: "Rotterdam", value: 650 },
                    ],
                  },
                ],
              },
              {
                name: "Southern Europe",
                children: [
                  {
                    name: "Spain",
                    children: [
                      { name: "Madrid", value: 3220 },
                      { name: "Barcelona", value: 1620 },
                      { name: "Valencia", value: 790 },
                    ],
                  },
                  {
                    name: "Italy",
                    children: [
                      { name: "Rome", value: 2870 },
                      { name: "Milan", value: 1370 },
                      { name: "Naples", value: 960 },
                    ],
                  },
                ],
              },
              {
                name: "Northern Europe",
                children: [
                  {
                    name: "Sweden",
                    children: [
                      { name: "Stockholm", value: 970 },
                      { name: "Gothenburg", value: 580 },
                    ],
                  },
                  {
                    name: "Norway",
                    children: [
                      { name: "Oslo", value: 690 },
                      { name: "Bergen", value: 280 },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: "Asia",
            children: [
              {
                name: "East Asia",
                children: [
                  {
                    name: "Japan",
                    children: [
                      { name: "Tokyo", value: 13960 },
                      { name: "Osaka", value: 2750 },
                      { name: "Kyoto", value: 1470 },
                    ],
                  },
                  {
                    name: "South Korea",
                    children: [
                      { name: "Seoul", value: 9770 },
                      { name: "Busan", value: 3430 },
                    ],
                  },
                  {
                    name: "China",
                    children: [
                      { name: "Shanghai", value: 24870 },
                      { name: "Beijing", value: 21540 },
                      { name: "Shenzhen", value: 12590 },
                      { name: "Guangzhou", value: 15300 },
                    ],
                  },
                ],
              },
              {
                name: "Southeast Asia",
                children: [
                  {
                    name: "Singapore",
                    children: [{ name: "Singapore City", value: 5690 }],
                  },
                  {
                    name: "Thailand",
                    children: [
                      { name: "Bangkok", value: 10540 },
                      { name: "Chiang Mai", value: 130 },
                    ],
                  },
                  {
                    name: "Vietnam",
                    children: [
                      { name: "Ho Chi Minh City", value: 8990 },
                      { name: "Hanoi", value: 8050 },
                    ],
                  },
                ],
              },
              {
                name: "South Asia",
                children: [
                  {
                    name: "India",
                    children: [
                      { name: "Mumbai", value: 20670 },
                      { name: "Delhi", value: 16780 },
                      { name: "Bangalore", value: 8440 },
                      { name: "Chennai", value: 4680 },
                      { name: "Hyderabad", value: 6810 },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: "South America",
            children: [
              {
                name: "Brazil",
                children: [
                  { name: "Sao Paulo", value: 12330 },
                  { name: "Rio de Janeiro", value: 6750 },
                  { name: "Brasilia", value: 3050 },
                ],
              },
              {
                name: "Argentina",
                children: [
                  { name: "Buenos Aires", value: 3060 },
                  { name: "Cordoba", value: 1390 },
                ],
              },
              {
                name: "Colombia",
                children: [
                  { name: "Bogota", value: 7410 },
                  { name: "Medellin", value: 2530 },
                ],
              },
            ],
          },
          {
            name: "Africa",
            children: [
              {
                name: "Nigeria",
                children: [
                  { name: "Lagos", value: 15390 },
                  { name: "Abuja", value: 3280 },
                ],
              },
              {
                name: "South Africa",
                children: [
                  { name: "Johannesburg", value: 5780 },
                  { name: "Cape Town", value: 4620 },
                ],
              },
              {
                name: "Kenya",
                children: [
                  { name: "Nairobi", value: 4400 },
                  { name: "Mombasa", value: 1200 },
                ],
              },
              {
                name: "Egypt",
                children: [
                  { name: "Cairo", value: 10230 },
                  { name: "Alexandria", value: 5160 },
                ],
              },
            ],
          },
          {
            name: "Oceania",
            children: [
              {
                name: "Australia",
                children: [
                  { name: "Sydney", value: 5310 },
                  { name: "Melbourne", value: 5080 },
                  { name: "Brisbane", value: 2560 },
                  { name: "Perth", value: 2080 },
                ],
              },
              {
                name: "New Zealand",
                children: [
                  { name: "Auckland", value: 1660 },
                  { name: "Wellington", value: 215 },
                ],
              },
            ],
          },
        ],
      },
    ],
    maxLabelDepth: 3,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 650 }}>
        <Story />
      </div>
    ),
  ],
};

export const ManyFirstLevel: Story = {
  args: {
    data: [
      {
        name: "Departments",
        children: [
          {
            name: "Engineering",
            children: [
              { name: "Frontend", value: 12 },
              { name: "Backend", value: 18 },
              { name: "QA", value: 6 },
            ],
          },
          {
            name: "Product",
            children: [
              { name: "PMs", value: 8 },
              { name: "Designers", value: 5 },
            ],
          },
          {
            name: "Sales",
            children: [
              { name: "Enterprise", value: 14 },
              { name: "SMB", value: 10 },
              { name: "Partnerships", value: 4 },
            ],
          },
          {
            name: "Marketing",
            children: [
              { name: "Growth", value: 6 },
              { name: "Content", value: 4 },
              { name: "Brand", value: 3 },
            ],
          },
          {
            name: "Finance",
            children: [
              { name: "Accounting", value: 5 },
              { name: "FP&A", value: 3 },
            ],
          },
          {
            name: "Legal",
            children: [
              { name: "Corporate", value: 3 },
              { name: "IP", value: 2 },
            ],
          },
          {
            name: "HR",
            children: [
              { name: "Recruiting", value: 7 },
              { name: "People Ops", value: 4 },
            ],
          },
          {
            name: "Operations",
            children: [
              { name: "IT", value: 6 },
              { name: "Facilities", value: 3 },
            ],
          },
          {
            name: "Customer Success",
            children: [
              { name: "Onboarding", value: 5 },
              { name: "Support", value: 9 },
              { name: "Renewals", value: 4 },
            ],
          },
          {
            name: "Data",
            children: [
              { name: "Analytics", value: 4 },
              { name: "Data Eng", value: 5 },
              { name: "ML", value: 3 },
            ],
          },
          {
            name: "Security",
            children: [
              { name: "AppSec", value: 3 },
              { name: "Infra", value: 4 },
            ],
          },
          {
            name: "DevRel",
            children: [
              { name: "Advocacy", value: 2 },
              { name: "Community", value: 3 },
            ],
          },
          {
            name: "Research",
            children: [
              { name: "Applied", value: 4 },
              { name: "Fundamental", value: 2 },
            ],
          },
          {
            name: "Compliance",
            children: [
              { name: "Audit", value: 2 },
              { name: "Risk", value: 3 },
            ],
          },
          {
            name: "Procurement",
            children: [
              { name: "Vendors", value: 2 },
              { name: "Contracts", value: 1 },
            ],
          },
          {
            name: "Localization",
            children: [
              { name: "Translation", value: 3 },
              { name: "Regional", value: 2 },
            ],
          },
        ],
      },
    ],
    maxLabelDepth: 2,
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
};
