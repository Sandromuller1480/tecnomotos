import { createClient } from '@/lib/supabase/server';
import { buildServiceReportPdf, type ServiceReportDetail } from '@/lib/reports/report-pdf';

const one = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] || null : value || null;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: hasPermission } = await supabase.rpc('has_permission', {
    user_uuid: user.id,
    required_permission: 'service_orders.view'
  });
  if (!hasPermission) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const { id } = await params;
  const { data, error } = await supabase
    .from('service_orders')
    .select(`
      id,
      service_type,
      description,
      status,
      total_price,
      notes,
      created_at,
      updated_at,
      customer:customers!service_orders_customer_id_fkey (
        document,
        profiles!customers_id_fkey (full_name, email, phone),
        addresses:customer_addresses (street, number, complement, neighborhood, city, state, postal_code, is_default)
      ),
      vehicle:customer_vehicles!service_orders_vehicle_id_fkey (brand, model, year, plate, color, vin, mileage),
      employee:employees!service_orders_employee_id_fkey (
        profiles!employees_id_fkey (full_name)
      )
    `)
    .eq('id', id)
    .single();

  if (error || !data) return Response.json({ error: 'Serviço não encontrado.' }, { status: 404 });

  const [productsResult, checklistResult, photosResult] = await Promise.all([
    supabase.from('service_order_products').select('product_name, product_sku, quantity, unit_price, total_price').eq('service_order_id', id).order('created_at'),
    supabase.from('service_order_checklist_items').select('label, status, notes').eq('service_order_id', id).order('sort_order'),
    supabase.from('service_order_photos').select('image_url, caption').eq('service_order_id', id).order('created_at')
  ]);

  if (productsResult.error || checklistResult.error || photosResult.error) {
    return Response.json({ error: 'Não foi possível carregar todos os dados do serviço.' }, { status: 500 });
  }

  const customer = one(data.customer);
  const profile = one(customer?.profiles);
  const vehicle = one(data.vehicle);
  const employee = one(data.employee);
  const mechanicProfile = one(employee?.profiles);
  const addresses = Array.isArray(customer?.addresses) ? customer.addresses : customer?.addresses ? [customer.addresses] : [];
  const address = addresses.find((item) => item.is_default) || addresses[0];

  const detail: ServiceReportDetail = {
    kind: 'service',
    id: data.id,
    status: data.status,
    serviceType: data.service_type,
    description: data.description,
    notes: data.notes,
    total: Number(data.total_price) || 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    customer: {
      name: profile?.full_name || 'Cliente não identificado',
      email: profile?.email,
      phone: profile?.phone,
      document: customer?.document,
      address: address
        ? `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ''}, ${address.neighborhood}, ${address.city}/${address.state} - ${address.postal_code}`
        : null
    },
    vehicle: vehicle ? {
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      plate: vehicle.plate,
      color: vehicle.color,
      vin: vehicle.vin,
      mileage: vehicle.mileage
    } : null,
    mechanic: mechanicProfile?.full_name || null,
    products: (productsResult.data || []).map((item) => ({
      sku: item.product_sku,
      name: item.product_name,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unit_price) || 0,
      total: Number(item.total_price) || 0
    })),
    checklist: (checklistResult.data || []).map((item) => ({
      label: item.label,
      status: item.status,
      notes: item.notes
    })),
    photos: (photosResult.data || []).map((item) => ({
      url: item.image_url,
      caption: item.caption
    }))
  };

  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'pdf') {
    return new Response(buildServiceReportPdf(detail), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="servico-${detail.id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  return Response.json(detail, { headers: { 'Cache-Control': 'no-store' } });
}
