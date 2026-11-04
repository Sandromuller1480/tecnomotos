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

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() || null;
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

    const { data: customerId, error: createError } = await supabaseServer.rpc('create_counter_customer', {
      p_full_name: input.fullName,
      p_email: normalizeEmail(input.email),
      p_phone: input.phone,
      p_document: input.document || null,
      p_birth_date: input.birthDate || null,
      p_street: input.street || null,
      p_number: input.number || null,
      p_complement: input.complement || null,
      p_neighborhood: input.neighborhood || null,
      p_city: input.city || null,
      p_state: input.state || null,
      p_postal_code: input.postalCode || null
    });
    if (createError) return { success: false, error: createError.message };

    return { success: true, customerId };
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
      .select('id, auth_user_id')
      .eq('id', input.customerId)
      .maybeSingle();
    if (lookupError || !customer) return { success: false, error: 'Cliente não encontrado.' };

    const { error: profileError } = await adminClient
      .from('profiles')
      .update({
        full_name: input.fullName.trim(),
        email: normalizeEmail(input.email),
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
    const { data: customer, error: lookupError } = await adminClient
      .from('customers')
      .select('auth_user_id')
      .eq('id', customerId)
      .maybeSingle();
    if (lookupError || !customer) return { success: false, error: 'Cliente não encontrado.' };

    if (customer.auth_user_id) {
      if (currentUser.id === customer.auth_user_id) {
        return { success: false, error: 'Você não pode excluir o próprio cadastro.' };
      }
      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(customer.auth_user_id);
      if (authDeleteError) return { success: false, error: authDeleteError.message };
    }

    const { error: profileDeleteError } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', customerId);
    if (profileDeleteError) return { success: false, error: profileDeleteError.message };

    return { success: true };
  } catch (err) {
    console.error('[deleteCustomerAction] Unexpected error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Erro inesperado ao excluir cliente.' };
  }
}
