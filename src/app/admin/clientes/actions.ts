'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

interface CreateCustomerInput {
  fullName: string;
  email?: string;
  phone: string;
  document?: string;
  birthDate?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

interface UpdateCustomerInput {
  customerId: string;
  fullName: string;
  email?: string;
  phone?: string;
  document?: string;
  birthDate?: string;
  status: string;
}

const INTERNAL_EMAIL_DOMAIN = 'internal.tecnomotos.local';

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() || null;
}

function internalCustomerEmail(customerId: string) {
  return `cliente-${customerId}@${INTERNAL_EMAIL_DOMAIN}`;
}

export async function createCustomerAction(input: CreateCustomerInput) {
  try {
    const supabaseServer = await createClient();
    const { data: { user: currentUser } } = await supabaseServer.auth.getUser();
    if (!currentUser) return { success: false, error: 'Não autorizado.' };

    const { data: hasCreatePermission } = await supabaseServer.rpc('has_permission', {
      user_uuid: currentUser.id,
      required_permission: 'customers.create'
    });
    if (!hasCreatePermission) {
      return { success: false, error: 'Você não tem permissão para cadastrar clientes.' };
    }

    const adminClient = createAdminClient();
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
    const email = normalizeEmail(input.email);
    const authEmail = email || `cliente-${crypto.randomUUID()}@${INTERNAL_EMAIL_DOMAIN}`;

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        role: 'CUSTOMER',
        email_is_internal: !email,
        full_name: input.fullName,
        phone: input.phone,
        address_street: input.street || '',
        address_number: input.number || '',
        address_complement: input.complement || '',
        address_neighborhood: input.neighborhood || '',
        address_city: input.city || '',
        address_state: input.state || '',
        address_postal_code: input.postalCode || '',
      }
    });
    if (authError) return { success: false, error: authError.message };

    const newUserId = authData.user?.id;
    if (!newUserId) return { success: false, error: 'Falha ao recuperar o ID do novo usuário.' };

    // Auth requires an identifier; the generated email stays hidden from business data.
    if (!email) {
      const { error: profileEmailError } = await adminClient
        .from('profiles')
        .update({ email: null })
        .eq('id', newUserId);
      if (profileEmailError) {
        await adminClient.auth.admin.deleteUser(newUserId);
        return { success: false, error: profileEmailError.message };
      }
    }

    if (input.document || input.birthDate) {
      const { error: customerError } = await adminClient
        .from('customers')
        .update({
          document: input.document ? input.document.replace(/\D/g, '') : null,
          birth_date: input.birthDate || null,
        })
        .eq('id', newUserId);
      if (customerError) console.error('[createCustomerAction] Error updating customer metadata:', customerError);
    }

    return { success: true, userId: newUserId };
  } catch (err) {
    console.error('[createCustomerAction] Unexpected error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Erro inesperado ao cadastrar cliente.' };
  }
}

export async function updateCustomerAction(input: UpdateCustomerInput) {
  try {
    const supabaseServer = await createClient();
    const { data: { user: currentUser } } = await supabaseServer.auth.getUser();
    if (!currentUser) return { success: false, error: 'Não autorizado.' };

    const { data: hasUpdatePermission } = await supabaseServer.rpc('has_permission', {
      user_uuid: currentUser.id,
      required_permission: 'customers.update'
    });
    if (!hasUpdatePermission) {
      return { success: false, error: 'Você não tem permissão para editar clientes.' };
    }

    const adminClient = createAdminClient();
    const { data: customer, error: lookupError } = await adminClient
      .from('customers')
      .select('id')
      .eq('id', input.customerId)
      .maybeSingle();
    if (lookupError || !customer) return { success: false, error: 'Cliente não encontrado.' };

    const email = normalizeEmail(input.email);
    const { error: authError } = await adminClient.auth.admin.updateUserById(input.customerId, {
      email: email || internalCustomerEmail(input.customerId),
      email_confirm: true,
      user_metadata: { email_is_internal: !email }
    });
    if (authError) return { success: false, error: authError.message };

    const { error: profileError } = await adminClient
      .from('profiles')
      .update({
        full_name: input.fullName.trim(),
        email,
        phone: input.phone?.trim() || null,
        status: input.status
      })
      .eq('id', input.customerId);
    if (profileError) return { success: false, error: profileError.message };

    const { error: detailsError } = await adminClient
      .from('customers')
      .update({
        document: input.document ? input.document.replace(/\D/g, '') : null,
        birth_date: input.birthDate || null
      })
      .eq('id', input.customerId);
    if (detailsError) return { success: false, error: detailsError.message };

    return { success: true };
  } catch (err) {
    console.error('[updateCustomerAction] Unexpected error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Erro inesperado ao editar cliente.' };
  }
}

export async function deleteCustomerAction(customerId: string) {
  try {
    const supabaseServer = await createClient();
    const { data: { user: currentUser } } = await supabaseServer.auth.getUser();
    if (!currentUser) return { success: false, error: 'Não autorizado.' };

    const { data: isOwner } = await supabaseServer.rpc('is_owner', { user_uuid: currentUser.id });
    if (!isOwner) return { success: false, error: 'Você não tem permissão para excluir clientes.' };
    if (currentUser.id === customerId) return { success: false, error: 'Você não pode excluir o próprio cadastro.' };

    const adminClient = createAdminClient();
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(customerId);
    if (deleteError) return { success: false, error: deleteError.message };

    return { success: true };
  } catch (err) {
    console.error('[deleteCustomerAction] Unexpected error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Erro inesperado ao excluir cliente.' };
  }
}
