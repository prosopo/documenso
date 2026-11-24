import type { SettingsNavItem } from '@documenso/lib/utils/settings-nav';
import { cn } from '@documenso/ui/lib/utils';
import { Badge } from '@documenso/ui/primitives/badge';
import type { MessageDescriptor } from '@lingui/core';
import { Trans } from '@lingui/react/macro';
import { Building2Icon, ChevronRightIcon, ShieldIcon, UserIcon, Users2Icon } from 'lucide-react';
import { match } from 'ts-pattern';

export type SettingsScopeBreadcrumbProps = {
  scope: 'organisation' | 'team' | 'account' | 'admin';
  scopeName: string;
  crumbs: string[];
};

export const SettingsScopeBreadcrumb = ({ scope, scopeName, crumbs }: SettingsScopeBreadcrumbProps) => {
  return (
    <nav
      aria-label="settings-scope-breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-2 text-muted-foreground text-sm"
      data-testid="settings-scope-breadcrumb"
    >
      <span>{scopeName}</span>

      {crumbs.map((crumb, idx) => {
        const isLeaf = idx === crumbs.length - 1;

        return (
          <span key={`${crumb}-${idx}`} className="flex items-center gap-2">
            <ChevronRightIcon className="h-3.5 w-3.5 opacity-50" />
            <span className={cn(isLeaf && 'font-semibold text-foreground')}>{crumb}</span>
          </span>
        );
      })}
      <Badge
        variant={match(scope)
          .with('organisation', () => 'default' as const)
          .with('team', () => 'secondary' as const)
          .with('account', () => 'neutral' as const)
          .with('admin', () => 'orange' as const)
          .exhaustive()}
        role="presentation"
        className="ml-auto gap-1.5"
        data-testid="settings-scope-breadcrumb-chip"
      >
        {scope === 'organisation' && (
          <>
            <Building2Icon className="h-3.5 w-3.5" />
            <Trans>Organisation Settings</Trans>
          </>
        )}
        {scope === 'team' && (
          <>
            <Users2Icon className="h-3.5 w-3.5" />
            <Trans>Team Settings</Trans>
          </>
        )}
        {scope === 'account' && (
          <>
            <UserIcon className="h-3.5 w-3.5" />
            <Trans>Account Settings</Trans>
          </>
        )}
        {scope === 'admin' && (
          <>
            <ShieldIcon className="h-3.5 w-3.5" />
            <Trans>Admin Panel</Trans>
          </>
        )}
      </Badge>
    </nav>
  );
};

/**
 * Walk a group's items and find the item (and its parent if it's a sub-nav child)
 * that matches the current pathname most specifically. Returns the labels to use
 * as breadcrumb crumbs (e.g. ['Preferences', 'Document'] or just ['Members']).
 */
export const findActiveSettingsCrumbs = (items: SettingsNavItem[], pathname: string): MessageDescriptor[] => {
  let bestMatch: SettingsNavItem | null = null;

  for (const item of items) {
    if (item.isSubNavParent) {
      continue;
    }

    if (pathname === item.path || pathname.startsWith(`${item.path}/`)) {
      if (!bestMatch || item.path.length > bestMatch.path.length) {
        bestMatch = item;
      }
    }
  }

  if (!bestMatch) {
    return [];
  }

  if (bestMatch.isSubNav) {
    const parent = items.find((it) => it.isSubNavParent);
    return parent ? [parent.label, bestMatch.label] : [bestMatch.label];
  }

  return [bestMatch.label];
};
