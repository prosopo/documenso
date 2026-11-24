import { cn } from '@documenso/ui/lib/utils';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

export type SettingsLayoutShellProps = {
  sidebar: ReactNode;
  mobileSidebar: ReactNode;
  children: ReactNode;

  /**
   * Merged onto the content column, e.g. to widen it past the default `max-w-3xl`.
   */
  contentClassName?: string;
};

/**
 * The sidebar and internally scrolling content pane shared by the settings and admin layouts.
 *
 * Only fills the viewport when its route sets `layoutMode: 'settings'` in its `handle`, which is
 * what makes the parent layouts render a full-height flex column for it to grow into.
 */
export const SettingsLayoutShell = ({
  sidebar,
  mobileSidebar,
  contentClassName,
  children,
}: SettingsLayoutShellProps) => {
  const { pathname } = useLocation();

  const contentPaneRef = useRef<HTMLElement>(null);

  // The pane scrolls instead of the window, so the router's scroll restoration never resets it.
  useEffect(() => {
    contentPaneRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex flex-col md:min-h-0 md:flex-1 md:flex-row">
      <aside className="hover-scrollbar w-full shrink-0 border-b bg-background md:w-80 md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex h-full flex-col">
          <div className="hidden md:block">{sidebar}</div>
          <div className="md:hidden">{mobileSidebar}</div>
        </div>
      </aside>

      <main ref={contentPaneRef} className="relative flex-1 px-4 md:overflow-y-auto md:px-12 lg:px-16">
        <div
          className={cn('mx-auto w-full max-w-3xl py-6 md:py-8', contentClassName)}
          data-testid="unified-settings-content"
        >
          {children}
        </div>
      </main>
    </div>
  );
};
