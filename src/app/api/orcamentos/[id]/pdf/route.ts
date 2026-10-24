import { buildQuotationReportPdf, type QuotationReportDetail } from '@/lib/reports/report-pdf';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('quotations')
    .select(`
      id,
      customer_name,
      customer_email,
      customer_phone,
      title,
      vehicle_info,
      status,
      valid_until,
      subtotal,
      discount_amount,
      total_amount,
      notes,
      created_at,
      quotation_items (
        description,
        item_type,
        quantity,
        unit_price,
        total_price
      )
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return Response.json({ error: 'Orçamento não encontrado.' }, { status: 404 });
  }

  const pdf = buildQuotationReportPdf(data as QuotationReportDetail);

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="orcamento-${id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'no-store'
    }
  });
}
