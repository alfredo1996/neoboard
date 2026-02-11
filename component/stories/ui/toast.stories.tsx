import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@/components/ui/button';
import {
  Toast,
  ToastAction,
} from '@/components/ui/toast';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';

const meta = {
  title: 'UI/Toast',
  component: Toast,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive'],
      description: 'The visual style variant of the toast',
    },
  },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function ToastDemo() {
    const { toast } = useToast();

    return (
      <>
        <Button
          variant="outline"
          onClick={() => {
            toast({
              title: 'Scheduled: Catch up',
              description: 'Friday, February 10, 2023 at 5:57 PM',
            });
          }}
        >
          Add to calendar
        </Button>
        <Toaster />
      </>
    );
  },
};

export const WithAction: Story = {
  render: function ToastWithAction() {
    const { toast } = useToast();

    return (
      <>
        <Button
          variant="outline"
          onClick={() => {
            toast({
              title: 'Uh oh! Something went wrong.',
              description: 'There was a problem with your request.',
              action: <ToastAction altText="Try again">Try again</ToastAction>,
            });
          }}
        >
          Show Toast
        </Button>
        <Toaster />
      </>
    );
  },
};

export const Destructive: Story = {
  render: function DestructiveToast() {
    const { toast } = useToast();

    return (
      <>
        <Button
          variant="outline"
          onClick={() => {
            toast({
              variant: 'destructive',
              title: 'Uh oh! Something went wrong.',
              description: 'There was a problem with your request.',
              action: <ToastAction altText="Try again">Try again</ToastAction>,
            });
          }}
        >
          Show Destructive Toast
        </Button>
        <Toaster />
      </>
    );
  },
};

export const Simple: Story = {
  render: function SimpleToast() {
    const { toast } = useToast();

    return (
      <>
        <Button
          variant="outline"
          onClick={() => {
            toast({
              description: 'Your message has been sent.',
            });
          }}
        >
          Show Toast
        </Button>
        <Toaster />
      </>
    );
  },
};

export const WithTitle: Story = {
  render: function TitleToast() {
    const { toast } = useToast();

    return (
      <>
        <Button
          variant="outline"
          onClick={() => {
            toast({
              title: 'Uh oh! Something went wrong.',
              description: 'There was a problem with your request.',
            });
          }}
        >
          Show Toast
        </Button>
        <Toaster />
      </>
    );
  },
};
