import { createClient } from '@/lib/supabase/server';
import { buildSaleReportPdf, type SaleReportDetail } from '@/lib/reports/report-pdf';

const one = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] || null : value || null;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: hasPermission } = await supabase.rpc('has_permission', {
    user_uuid: user.id,
    required_permission: 'orders.view'
  });
  if (!hasPermission) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const { id } = await params;
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      customer_email,
      customer_name,
      status,
      quotation_id,
      total_amount,
      sales_channel,
      payment_method,
      payment_date,
      notes,
      created_at,
      customer:customers!orders_customer_id_fkey (
        document,
        profiles!customers_id_fkey (full_name, email, phone),
        addresses:customer_addresses (street, number, complement, neighborhood, city, state, postal_code, is_default)
      ),
      order_items (
        item_type,
        description,
        quantity,
        unit_price,
        total_price,
        products:product_id (sku, name, brand, category)
      )
    `)
    .eq('id', id)
    .single();

  if (error || !data) return Response.json({ error: 'Venda não encontrada.' }, { status: 404 });

  const customer = one(data.customer);
  const profile = one(customer?.profiles);
  const addresses = Array.isArray(customer?.addresses) ? customer.addresses : customer?.addresses ? [customer.addresses] : [];
  const address = addresses.find((item) => item.is_default) || addresses[0];
  const { data: serviceOrder } = data.quotation_id
    ? await supabase
        .from('service_orders')
        .select('id, status')
        .eq('quotation_id', data.quotation_id)
        .maybeSingle()
    : { data: null };

  const detail: SaleReportDetail = {
    kind: 'sale',
    id: data.id,
    status: data.status,
    salesChannel: data.sales_channel || 'ONLINE',
    paymentMethod: data.payment_method || (data.sales_channel === 'ONLINE' ? 'Stripe' : null),
    paymentDate: data.payment_date,
    createdAt: data.created_at,
    notes: data.notes,
    total: Number(data.total_amount) || 0,
    serviceOrder: serviceOrder
      ? { id: serviceOrder.id, status: serviceOrder.status }
      : null,
    customer: {
      name: data.customer_name || profile?.full_name || 'Cliente não identificado',
      email: data.customer_email || profile?.email,
      phone: profile?.phone,
      document: customer?.document,
      address: address
        ? `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ''}, ${address.neighborhood}, ${address.city}/${address.state} - ${address.postal_code}`
        : null
    },
    items: (data.order_items || []).map((row) => {
      const product = one(row.products);
      const quantity = Number(row.quantity) || 0;
      const unitPrice = Number(row.unit_price) || 0;
      return {
        itemType: row.item_type === 'SERVICE' ? 'SERVICE' : 'PRODUCT',
        sku: product?.sku,
        name: row.description || product?.name || (row.item_type === 'SERVICE' ? 'Serviço' : 'Produto removido'),
        brand: product?.brand,
        category: product?.category,
        quantity,
        unitPrice,
        total: Number(row.total_price) || quantity * unitPrice
      };
    })
  };

  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'pdf') {
    return new Response(buildSaleReportPdf(detail), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="venda-${detail.id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  return Response.json(detail, { headers: { 'Cache-Control': 'no-store' } });
}
