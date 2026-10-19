import type { ReactNode } from "react";
import { Panel, PanelContent, Wordmark } from "@neoboard/components";

interface AuthCardProps {
  /** The page's real heading for assistive tech; the wordmark is the visible mark. */
  readonly title: string;
  /** One line under the wordmark. */
  readonly lead: ReactNode;
  readonly children: ReactNode;
  /** Quiet line under the card body, e.g. "No account yet? Sign up". */
  readonly footer?: ReactNode;
}

/** The one centred card sign in, sign up and change password share (#2256). */
export function AuthCard({ title, lead, children, footer }: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page-ground px-4 py-10">
      <Panel className="w-full max-w-[380px] p-7">
        <h1 className="sr-only">{title}</h1>
        <PanelContent className="space-y-5 p-0">
          <div className="space-y-1.5 text-center">
            <Wordmark className="justify-center" />
            <p className="text-[13px] text-muted-foreground">{lead}</p>
          </div>
          {children}
          {footer && (
            <p className="text-center text-[13px] text-muted-foreground">
              {footer}
            </p>
          )}
        </PanelContent>
      </Panel>
    </main>
  );
}
