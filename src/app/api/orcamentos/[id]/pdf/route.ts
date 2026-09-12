import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

interface QuotationItemRow {
  description: string;
  item_type: string;
  quantity: number | string | null;
  unit_price: number | string | null;
  total_price: number | string | null;
}

interface QuotationRow {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  title: string;
  vehicle_info: string | null;
  status: string;
  valid_until: string | null;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  total_amount: number | string | null;
  notes: string | null;
  created_at: string;
  quotation_items?: QuotationItemRow[] | null;
}

const asNumber = (value: number | string | null | undefined) => parseFloat(String(value ?? 0)) || 0;

const money = (value: number | string | null | undefined) =>
  asNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const date = (value: string | null | undefined) =>
  value ? new Date(`${value.includes('T') ? value : `${value}T00:00:00`}`).toLocaleDateString('pt-BR') : '-';

function cleanText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfText(value: unknown) {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(quotation: QuotationRow) {
  const lines: Array<{ text: string; size?: number; x?: number }> = [
    { text: 'TECNOMOTOS', size: 22 },
    { text: 'ORCAMENTO DO CLIENTE', size: 16 },
    { text: `Codigo: #${quotation.id.slice(0, 8).toUpperCase()}` },
    { text: `Titulo: ${quotation.title}` },
    { text: `Cliente: ${quotation.customer_name || 'Sem cliente anexado'}` },
    { text: `Contato: ${quotation.customer_email || quotation.customer_phone || '-'}` },
    { text: `Veiculo: ${quotation.vehicle_info || '-'}` },
    { text: `Status: ${quotation.status}` },
    { text: `Validade: ${date(quotation.valid_until)}` },
    { text: '' },
    { text: 'ITENS', size: 14 }
  ];

  (quotation.quotation_items || []).forEach((item, index) => {
    lines.push({
      text: `${index + 1}. ${item.description} | Qtd ${item.quantity || 0} | Unit ${money(item.unit_price)} | Total ${money(item.total_price)}`
    });
  });

  lines.push(
    { text: '' },
    { text: `Subtotal: ${money(quotation.subtotal)}` },
    { text: `Desconto: ${money(quotation.discount_amount)}` },
    { text: `Total: ${money(quotation.total_amount)}`, size: 14 },
    { text: '' },
    { text: `Observacoes: ${quotation.notes || '-'}` }
  );

  let y = 790;
  const content = lines.map((line) => {
    const size = line.size || 11;
    const x = line.x || 50;
    const currentY = y;
    y -= line.text ? size + 9 : 14;
    return `BT /F1 ${size} Tf ${x} ${currentY} Td (${pdfText(line.text)}) Tj ET`;
  }).join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(content, 'latin1')} >> stream\n${content}\nendstream endobj`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

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
    return Response.json({ error: 'Orcamento nao encontrado.' }, { status: 404 });
  }

  const pdf = buildPdf(data as QuotationRow);

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="orcamento-${id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'no-store'
    }
  });
}
