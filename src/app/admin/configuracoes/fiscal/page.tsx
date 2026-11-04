import { requireServerPermission } from '@/lib/permissions/rules';
import { FiscalSettingsDashboard } from '@/components/fiscal/FiscalSettingsDashboard';

export default async function FiscalSettingsPage() {
  await requireServerPermission('fiscal.view');
  return <FiscalSettingsDashboard />;
}

