import type { Meta, StoryObj } from "@storybook/react";
import { IframeWidget } from "@/components/composed/iframe-widget";

const meta = {
  title: "Composed/IframeWidget",
  component: IframeWidget,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IframeWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    url: "https://example.com",
  },
};

export const Empty: Story = {
  args: {
    url: undefined,
  },
};

export const CustomTitle: Story = {
  args: {
    url: "https://example.com",
    title: "IANA Example Domain",
  },
};

export const InvalidUrl: Story = {
  args: {
    url: "not-a-valid-url://test",
  },
};

export const WithCustomSandbox: Story = {
  args: {
    url: "https://example.com",
    title: "Sandboxed content",
    sandbox: "allow-scripts allow-popups allow-forms",
  },
};
