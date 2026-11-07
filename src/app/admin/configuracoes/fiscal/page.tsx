import { requireServerPermission } from '@/lib/permissions/rules';
import { FiscalSettingsDashboard } from '@/components/fiscal/FiscalSettingsDashboard';

export default async function FiscalSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; product?: string }>;
}) {
  await requireServerPermission('fiscal.view');
  const query = await searchParams;
  const allowedTabs = ['company', 'profiles', 'rules', 'pending', 'monitoring'] as const;
  const initialTab = allowedTabs.find((tab) => tab === query.tab) || 'company';
  return <FiscalSettingsDashboard initialTab={initialTab} targetProductId={query.product} />;
}
