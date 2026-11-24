import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import type { RouteHandle } from '@documenso/lib/client-only/hooks/use-child-route-flags';
import { IS_DOCUMENSO_CLOUD } from '@documenso/lib/constants/app';
import { LicenseClient } from '@documenso/lib/server-only/license/license-client';
import { isAdmin } from '@documenso/lib/utils/is-admin';
import type { SettingsNavItem } from '@documenso/lib/utils/settings-nav';
import { cn } from '@documenso/ui/lib/utils';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import {
  AlertTriangleIcon,
  BarChart3Icon,
  Building2Icon,
  FileStackIcon,
  LineChartIcon,
  MailIcon,
  SettingsIcon,
  TrophyIcon,
  UsersIcon,
  Wallet2Icon,
  WorkflowIcon,
} from 'lucide-react';
import { Outlet, redirect, useLocation } from 'react-router';

import { AdminLicenseStatusBanner } from '~/components/general/admin-license-status-banner';
import { SettingsLayoutShell } from '~/components/general/settings-layout-shell';
import { findActiveSettingsCrumbs, SettingsScopeBreadcrumb } from '~/components/general/settings-scope-breadcrumb';
import { SettingsSidebarGroup } from '~/components/general/unified-settings-sidebar';
import { SettingsNavJumpSelect } from '~/components/general/unified-settings-sidebar-mobile';
import { adminMiddleware } from '~/middleware/admin';
import { appMetaTags } from '~/utils/meta';
import type { Route } from './+types/_layout';

export function meta() {
  return appMetaTags(msg`Admin`);
}

export const handle: RouteHandle = {
  layoutMode: 'settings',
};

export const middleware = [adminMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
  const { user } = await getOptionalSession(request);

  const license = await LicenseClient.getInstance()?.getCachedLicense();

  if (!user || !isAdmin(user)) {
    throw redirect('/');
  }

  return {
    license: license || null,
  };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { license } = loaderData;

  const { _ } = useLingui();
  const { pathname } = useLocation();

  const navGroups = getAdminNavGroups();

  const crumbs = findActiveSettingsCrumbs(
    navGroups.flatMap((group) => group.items),
    pathname,
  ).map((label) => _(label));

  return (
    <SettingsLayoutShell
      // Admin pages are mostly wide data tables and charts, which get cramped at the
      // settings pages' `max-w-3xl`.
      contentClassName="max-w-5xl"
      sidebar={
        <aside className="flex w-full flex-col" data-testid="admin-sidebar">
          {navGroups.map((group, index) => (
            <div key={group.key} className={cn('p-4', index > 0 && 'border-t')}>
              <SettingsSidebarGroup heading={_(group.label)} items={group.items} scope="admin" />
            </div>
          ))}
        </aside>
      }
      mobileSidebar={
        <div className="flex flex-col gap-3 pb-4" data-testid="admin-sidebar-mobile">
          <div className="px-4 py-2 text-center font-bold text-muted-foreground text-xs uppercase tracking-wide">
            <Trans>Admin Panel</Trans>
          </div>

          <div className="px-4">
            <SettingsNavJumpSelect groups={navGroups} />
          </div>
        </div>
      }
    >
      <AdminLicenseStatusBanner license={license} />

      <SettingsScopeBreadcrumb scope="admin" scopeName={_(msg`Admin`)} crumbs={crumbs} />

      <Outlet />
    </SettingsLayoutShell>
  );
}

type AdminNavGroup = {
  key: string;
  label: MessageDescriptor;
  items: SettingsNavItem[];
};

// Built at render rather than at module scope: `IS_DOCUMENSO_CLOUD()` reads `window.__ENV__`
// on the client, which may not be populated when this module is first evaluated.
const getAdminNavGroups = (): AdminNavGroup[] => [
  {
    key: 'insights',
    label: msg`Insights`,
    items: [
      { key: 'stats', path: '/admin/stats', label: msg`Stats`, icon: BarChart3Icon },
      {
        key: 'organisation-insights',
        path: '/admin/organisation-insights',
        label: msg`Organisation Insights`,
        icon: TrophyIcon,
      },
      {
        key: 'organisation-stats',
        path: '/admin/organisation-stats',
        label: msg`Organisation Stats`,
        icon: LineChartIcon,
      },
    ],
  },
  {
    key: 'accounts',
    label: msg`Accounts`,
    items: [
      { key: 'organisations', path: '/admin/organisations', label: msg`Organisations`, icon: Building2Icon },
      { key: 'users', path: '/admin/users', label: msg`Users`, icon: UsersIcon },
      { key: 'claims', path: '/admin/claims', label: msg`Claims`, icon: Wallet2Icon },
    ],
  },
  {
    key: 'documents',
    label: msg`Documents`,
    items: [
      { key: 'documents', path: '/admin/documents', label: msg`Documents`, icon: FileStackIcon },
      {
        key: 'unsealed-documents',
        path: '/admin/unsealed-documents',
        label: msg`Unsealed Documents`,
        icon: AlertTriangleIcon,
      },
    ],
  },
  {
    key: 'platform',
    label: msg`Platform`,
    items: [
      { key: 'email-transports', path: '/admin/email-transports', label: msg`Email Transports`, icon: MailIcon },
      { key: 'email-domains', path: '/admin/email-domains', label: msg`Email Domains`, icon: MailIcon },
      ...(IS_DOCUMENSO_CLOUD() ? [{ key: 'rules', path: '/admin/rules', label: msg`Rules`, icon: WorkflowIcon }] : []),
      { key: 'site-settings', path: '/admin/site-settings', label: msg`Site Settings`, icon: SettingsIcon },
    ],
  },
];
