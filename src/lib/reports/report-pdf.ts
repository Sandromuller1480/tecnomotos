import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ReportParty {
  name: string;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  address?: string | null;
}

export interface SaleReportDetail {
  kind: 'sale';
  id: string;
  status: string;
  salesChannel: string;
  paymentMethod?: string | null;
  paymentDate?: string | null;
  createdAt: string;
  notes?: string | null;
  total: number;
  customer: ReportParty;
  items: Array<{
    sku?: string | null;
    name: string;
    brand?: string | null;
    category?: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

export interface ServiceReportDetail {
  kind: 'service';
  id: string;
  status: string;
  serviceType: string;
  description?: string | null;
  notes?: string | null;
  total: number;
  createdAt: string;
  updatedAt?: string | null;
  customer: ReportParty;
  vehicle?: {
    brand?: string | null;
    model?: string | null;
    year?: number | null;
    plate?: string | null;
    color?: string | null;
    vin?: string | null;
    mileage?: number | null;
  } | null;
  mechanic?: string | null;
  products: Array<{
    sku?: string | null;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  checklist: Array<{
    label: string;
    status: string;
    notes?: string | null;
  }>;
  photos: Array<{
    url: string;
    caption?: string | null;
  }>;
}

export interface QuotationReportDetail {
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
  quotation_items?: Array<{
    description: string;
    item_type: string;
    quantity: number | string | null;
    unit_price: number | string | null;
    total_price: number | string | null;
  }> | null;
}

type ReportDetail = SaleReportDetail | ServiceReportDetail;
type Color = [number, number, number];
type Font = 'regular' | 'bold' | 'italic';
type Align = 'left' | 'center' | 'right';
type TableColumn = { header: string; width: number; align?: Align };

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_MARGIN = 54;

const BRAND_RED: Color = [0.882, 0.024, 0];
const BRAND_BLACK: Color = [0.031, 0.031, 0.031];
const DARK_GREY: Color = [0.16, 0.16, 0.16];
const MID_GREY: Color = [0.52, 0.52, 0.52];
const LIGHT_GREY: Color = [0.925, 0.925, 0.925];
const LINE_GREY: Color = [0.74, 0.74, 0.74];
const WHITE: Color = [1, 1, 1];

const COMPANY_NAME = process.env.PDF_COMPANY_NAME || 'TECNOMOTOS MOTOCICLETAS LTDA';
const COMPANY_EMAIL = process.env.PDF_COMPANY_EMAIL || process.env.OWNER_EMAIL || 'contato@tecnomotos.com.br';
const COMPANY_PHONE = process.env.PDF_COMPANY_PHONE || '(65) 99677-3190';

const asNumber = (value: number | string | null | undefined) => Number.parseFloat(String(value ?? 0)) || 0;
const money = (value: number | string | null | undefined) => asNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value?: string | null) => value ? new Date(value.includes('T') ? value : `${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '-';

function normalizePdfText(value: unknown) {
  return String(value ?? '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim() || '-';
}

function pdfString(value: unknown) {
  const bytes = Buffer.from(normalizePdfText(value), 'latin1');
  let escaped = '';
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) escaped += `\\${String.fromCharCode(byte)}`;
    else if (byte < 0x20 || byte > 0x7e) escaped += `\\${byte.toString(8).padStart(3, '0')}`;
    else escaped += String.fromCharCode(byte);
  }
  return escaped;
}

function color(value: Color) {
  return value.map((channel) => channel.toFixed(3)).join(' ');
}

function textWidth(value: unknown, size: number) {
  return normalizePdfText(value).split('').reduce((width, char) => {
    if (char === ' ') return width + size * 0.28;
    if ('il.,:;|!'.includes(char)) return width + size * 0.25;
    if ('mwMW@#%&'.includes(char)) return width + size * 0.78;
    if (char >= 'A' && char <= 'Z') return width + size * 0.62;
    return width + size * 0.5;
  }, 0);
}

function wrapText(value: unknown, maxWidth: number, size: number) {
  const words = normalizePdfText(value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (textWidth(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = '';
    for (const char of word) {
      if (textWidth(`${chunk}${char}`, size) <= maxWidth) chunk += char;
      else {
        if (chunk) lines.push(chunk);
        chunk = char;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
}

class BrandedPdf {
  private pages: string[][] = [];
  private pageIndex = -1;
  private y = 0;

  constructor(private readonly title: string, private readonly reference: string) {
    this.newPage();
  }

  private get page() {
    return this.pages[this.pageIndex];
  }

  private text(x: number, y: number, value: unknown, options: { size?: number; font?: Font; color?: Color; align?: Align; width?: number } = {}) {
    const size = options.size ?? 9;
    const font = options.font === 'bold' ? 'F2' : options.font === 'italic' ? 'F3' : 'F1';
    const width = options.width ?? 0;
    let drawX = x;
    if (options.align === 'right') drawX += width - textWidth(value, size);
    if (options.align === 'center') drawX += (width - textWidth(value, size)) / 2;
    this.page.push(`${color(options.color ?? DARK_GREY)} rg BT /${font} ${size} Tf ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${pdfString(value)}) Tj ET`);
  }

  private line(x1: number, y1: number, x2: number, y2: number, stroke: Color = LINE_GREY, width = 0.6) {
    this.page.push(`q ${color(stroke)} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  }

  private rect(x: number, y: number, width: number, height: number, fill: Color, stroke?: Color) {
    this.page.push(`q ${color(fill)} rg${stroke ? ` ${color(stroke)} RG 0.5 w` : ''} ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${stroke ? 'B' : 'f'} Q`);
  }

  private drawHeader() {
    this.rect(MARGIN, PAGE_HEIGHT - 111, CONTENT_WIDTH, 75, [0.965, 0.965, 0.965]);
    this.page.push(`q 138 0 0 52 ${MARGIN + 9} ${PAGE_HEIGHT - 99} cm /Logo Do Q`);
    this.text(MARGIN + 158, PAGE_HEIGHT - 63, COMPANY_NAME, { size: 9, font: 'bold', color: BRAND_BLACK });
    this.text(MARGIN + 158, PAGE_HEIGHT - 79, COMPANY_EMAIL, { size: 8, font: 'italic', color: DARK_GREY });
    this.text(MARGIN + 158, PAGE_HEIGHT - 94, `Fone: ${COMPANY_PHONE}`, { size: 8, color: DARK_GREY });
    this.text(MARGIN + 322, PAGE_HEIGHT - 66, this.title, { size: 17, color: BRAND_BLACK, align: 'right', width: CONTENT_WIDTH - 322 });
    this.text(MARGIN + 322, PAGE_HEIGHT - 88, this.reference, { size: 8, font: 'bold', color: BRAND_RED, align: 'right', width: CONTENT_WIDTH - 322 });
    this.line(MARGIN, PAGE_HEIGHT - 121, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 121, BRAND_RED, 1.4);
    this.y = PAGE_HEIGHT - 145;
  }

  private newPage() {
    this.pages.push([]);
    this.pageIndex += 1;
    this.drawHeader();
  }

  private ensure(height: number, afterBreak?: () => void) {
    if (this.y - height < BOTTOM_MARGIN) {
      this.newPage();
      afterBreak?.();
    }
  }

  section(title: string) {
    this.ensure(34);
    this.text(MARGIN, this.y, title.toUpperCase(), { size: 11, font: 'bold', color: BRAND_BLACK });
    this.line(MARGIN, this.y - 8, PAGE_WIDTH - MARGIN, this.y - 8, LINE_GREY, 0.7);
    this.rect(MARGIN, this.y - 9, 54, 2, BRAND_RED);
    this.y -= 27;
  }

  fields(entries: Array<[string, unknown]>) {
    const gap = 24;
    const columnWidth = (CONTENT_WIDTH - gap) / 2;
    for (let index = 0; index < entries.length; index += 2) {
      const row = entries.slice(index, index + 2);
      const wrapped = row.map(([, value]) => wrapText(value, columnWidth, 8.5).slice(0, 3));
      const rowHeight = Math.max(34, Math.max(...wrapped.map((lines) => lines.length)) * 11 + 20);
      this.ensure(rowHeight);
      row.forEach(([label], column) => {
        const x = MARGIN + column * (columnWidth + gap);
        this.text(x, this.y, label.toUpperCase(), { size: 6.8, font: 'bold', color: MID_GREY });
        wrapped[column].forEach((line, lineIndex) => this.text(x, this.y - 13 - lineIndex * 10, line, { size: 8.5 }));
      });
      this.y -= rowHeight;
    }
    this.y -= 3;
  }

  paragraph(value: unknown) {
    const lines = wrapText(value, CONTENT_WIDTH, 8.5);
    this.ensure(lines.length * 11 + 12);
    lines.forEach((line, index) => this.text(MARGIN, this.y - index * 11, line, { size: 8.5 }));
    this.y -= lines.length * 11 + 12;
  }

  table(columns: TableColumn[], rows: unknown[][]) {
    const drawHeader = () => {
      this.rect(MARGIN, this.y - 23, CONTENT_WIDTH, 23, BRAND_RED);
      let x = MARGIN;
      columns.forEach((column) => {
        this.text(x + 5, this.y - 15, column.header, { size: 7.2, font: 'bold', color: WHITE, align: column.align, width: column.width - 10 });
        x += column.width;
      });
      this.y -= 23;
    };

    this.ensure(48);
    drawHeader();
    if (!rows.length) rows = [['Nenhum item cadastrado.']];

    rows.forEach((row, rowIndex) => {
      const wrapped = columns.map((column, columnIndex) => wrapText(row[columnIndex] ?? '', column.width - 10, 7.8).slice(0, 4));
      const rowHeight = Math.max(25, Math.max(...wrapped.map((lines) => lines.length)) * 10 + 10);
      this.ensure(rowHeight + 2, drawHeader);
      this.rect(MARGIN, this.y - rowHeight, CONTENT_WIDTH, rowHeight, rowIndex % 2 ? LIGHT_GREY : WHITE);
      let x = MARGIN;
      wrapped.forEach((lines, columnIndex) => {
        lines.forEach((line, lineIndex) => this.text(x + 5, this.y - 16 - lineIndex * 10, line, {
          size: 7.8,
          font: columnIndex === columns.length - 1 ? 'bold' : 'regular',
          align: columns[columnIndex].align,
          width: columns[columnIndex].width - 10
        }));
        x += columns[columnIndex].width;
      });
      this.line(MARGIN, this.y - rowHeight, PAGE_WIDTH - MARGIN, this.y - rowHeight, WHITE, 0.8);
      this.y -= rowHeight;
    });
    this.y -= 12;
  }

  totals(rows: Array<[string, string]>) {
    const boxWidth = 225;
    const rowHeight = 22;
    const height = rows.length * rowHeight;
    this.ensure(height + 15);
    const x = PAGE_WIDTH - MARGIN - boxWidth;
    rows.forEach(([label, value], index) => {
      const rowY = this.y - (index + 1) * rowHeight;
      this.rect(x, rowY, boxWidth, rowHeight, index === rows.length - 1 ? [0.84, 0.84, 0.84] : LIGHT_GREY);
      this.text(x + 10, rowY + 7, label.toUpperCase(), { size: 8, font: 'bold', color: index === rows.length - 1 ? BRAND_BLACK : MID_GREY });
      this.text(x + 100, rowY + 6, value, { size: index === rows.length - 1 ? 10 : 8.5, font: 'bold', color: index === rows.length - 1 ? BRAND_RED : DARK_GREY, align: 'right', width: boxWidth - 112 });
    });
    this.y -= height + 17;
  }

  build() {
    const generatedAt = dateTime(new Date().toISOString());
    this.pages.forEach((commands, index) => {
      commands.push(`q ${color(LINE_GREY)} RG 0.5 w ${MARGIN} 36 m ${PAGE_WIDTH - MARGIN} 36 l S Q`);
      commands.push(`${color(MID_GREY)} rg BT /F1 6.8 Tf ${MARGIN} 22 Td (${pdfString(`TECNOMOTOS - Documento gerado em ${generatedAt}`)}) Tj ET`);
      commands.push(`${color(MID_GREY)} rg BT /F2 6.8 Tf ${PAGE_WIDTH - MARGIN - 62} 22 Td (${pdfString(`Página ${index + 1} de ${this.pages.length}`)}) Tj ET`);
    });
    return encodePdf(this.pages);
  }
}

function encodePdf(pages: string[][]) {
  const logo = readFileSync(join(process.cwd(), 'public', 'logo-pdf.jpg'));
  const logoHex = logo.toString('hex').toUpperCase();
  const objects: string[] = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Kids [${pages.map((_, index) => `${3 + index} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`
  ];
  const fontStart = 3 + pages.length;
  const imageId = fontStart + 3;
  const contentStart = imageId + 1;

  pages.forEach((_, index) => objects.push(`${3 + index} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontStart} 0 R /F2 ${fontStart + 1} 0 R /F3 ${fontStart + 2} 0 R >> /XObject << /Logo ${imageId} 0 R >> >> /Contents ${contentStart + index} 0 R >> endobj`));
  objects.push(
    `${fontStart} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj`,
    `${fontStart + 1} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj`,
    `${fontStart + 2} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >> endobj`,
    `${imageId} 0 obj << /Type /XObject /Subtype /Image /Width 800 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${logoHex.length + 1} >> stream\n${logoHex}>\nendstream endobj`
  );
  pages.forEach((commands, index) => {
    const content = commands.join('\n');
    objects.push(`${contentStart + index} 0 obj << /Length ${Buffer.byteLength(content, 'latin1')} >> stream\n${content}\nendstream endobj`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const itemColumns: TableColumn[] = [
  { header: 'Tipo', width: 55 },
  { header: 'Descrição', width: 215 },
  { header: 'Preço unit.', width: 76, align: 'right' },
  { header: 'Quant.', width: 48, align: 'right' },
  { header: 'Desconto', width: 59, align: 'right' },
  { header: 'Total', width: 58.28, align: 'right' }
];

export function buildSaleReportPdf(detail: SaleReportDetail) {
  const report = new BrandedPdf('Venda', `Nº ${detail.id.slice(0, 8).toUpperCase()}`);
  report.section('Dados da venda');
  report.fields([
    ['Cliente', detail.customer.name], ['Data', date(detail.createdAt)],
    ['Telefone', detail.customer.phone || '-'], ['Situação', detail.status],
    ['E-mail', detail.customer.email || '-'], ['Canal de venda', detail.salesChannel],
    ['Endereço', detail.customer.address || '-'], ['Pagamento', detail.paymentMethod || '-'],
    ['Documento', detail.customer.document || '-'], ['Data do pagamento', date(detail.paymentDate)]
  ]);
  report.section('Itens da venda');
  report.table(itemColumns, detail.items.map((item) => [
    'Produto', `${item.sku ? `${item.sku} - ` : ''}${item.name}`, money(item.unitPrice), item.quantity, money(0), money(item.total)
  ]));
  report.totals([
    ['Total de itens', String(detail.items.reduce((sum, item) => sum + item.quantity, 0))],
    ['Total', money(detail.total)]
  ]);
  report.section('Financeiro');
  report.table([
    { header: '#', width: 45, align: 'center' },
    { header: 'Valor', width: 110, align: 'right' },
    { header: 'Data pgto.', width: 105, align: 'center' },
    { header: 'Forma de pagamento', width: 160, align: 'center' },
    { header: 'Situação', width: 91.28, align: 'center' }
  ], [[
    '1/1', money(detail.total), date(detail.paymentDate), detail.paymentMethod || '-', detail.paymentDate ? 'Pago' : 'A pagar'
  ]]);
  if (detail.notes) {
    report.section('Observações');
    report.paragraph(detail.notes);
  }
  return report.build();
}

export function buildServiceReportPdf(detail: ServiceReportDetail) {
  const report = new BrandedPdf('Ordem de serviço', `OS Nº ${detail.id.slice(0, 8).toUpperCase()}`);
  report.section('Dados do serviço');
  report.fields([
    ['Cliente', detail.customer.name], ['Data', date(detail.createdAt)],
    ['Telefone', detail.customer.phone || '-'], ['Situação', detail.status],
    ['E-mail', detail.customer.email || '-'], ['Tipo de serviço', detail.serviceType],
    ['Endereço', detail.customer.address || '-'], ['Mecânico', detail.mechanic || 'Não alocado'],
    ['Documento', detail.customer.document || '-'], ['Atualização', dateTime(detail.updatedAt)]
  ]);
  if (detail.vehicle) {
    report.section('Motocicleta');
    report.fields([
      ['Marca / modelo', `${detail.vehicle.brand || '-'} ${detail.vehicle.model || ''}`.trim()], ['Ano', detail.vehicle.year || '-'],
      ['Placa', detail.vehicle.plate || '-'], ['Cor', detail.vehicle.color || '-'],
      ['Chassi', detail.vehicle.vin || '-'], ['Quilometragem', detail.vehicle.mileage != null ? `${detail.vehicle.mileage} km` : '-']
    ]);
  }
  report.section('Descrição do serviço');
  report.paragraph(detail.description || '-');
  report.section('Peças e produtos');
  report.table(itemColumns, detail.products.map((item) => [
    'Produto', `${item.sku ? `${item.sku} - ` : ''}${item.name}`, money(item.unitPrice), item.quantity, money(0), money(item.total)
  ]));
  report.totals([
    ['Total de itens', String(detail.products.reduce((sum, item) => sum + item.quantity, 0))],
    ['Total', money(detail.total)]
  ]);
  if (detail.checklist.length) {
    report.section('Checklist técnico');
    report.table([
      { header: 'Item', width: 205 },
      { header: 'Situação', width: 100 },
      { header: 'Observações', width: 206.28 }
    ], detail.checklist.map((item) => [item.label, item.status, item.notes || '-']));
  }
  if (detail.notes) {
    report.section('Observações');
    report.paragraph(detail.notes);
  }
  if (detail.photos.length) {
    report.section('Registro fotográfico');
    detail.photos.forEach((photo, index) => report.paragraph(`${index + 1}. ${photo.caption || 'Foto do atendimento'} - ${photo.url}`));
  }
  return report.build();
}

const quotationStatus: Record<string, string> = {
  DRAFT: 'Rascunho', SENT: 'Enviado', APPROVED: 'Aprovado', REJECTED: 'Recusado', EXPIRED: 'Expirado'
};
const quotationItemType: Record<string, string> = {
  PRODUCT: 'Produto', SERVICE: 'Serviço', PART: 'Peça', LABOR: 'Mão de obra'
};

export function buildQuotationReportPdf(detail: QuotationReportDetail) {
  const report = new BrandedPdf('Orçamento', `Nº ${detail.id.slice(0, 8).toUpperCase()}`);
  report.section('Dados do orçamento');
  report.fields([
    ['Cliente', detail.customer_name || 'Sem cliente anexado'], ['Data', date(detail.created_at)],
    ['Telefone', detail.customer_phone || '-'], ['Situação', quotationStatus[detail.status] || detail.status],
    ['E-mail', detail.customer_email || '-'], ['Validade', date(detail.valid_until)],
    ['Título', detail.title], ['Veículo', detail.vehicle_info || '-']
  ]);
  report.section('Itens do orçamento');
  report.table(itemColumns, (detail.quotation_items || []).map((item) => [
    quotationItemType[item.item_type] || item.item_type || '-', item.description, money(item.unit_price), item.quantity || 0, money(0), money(item.total_price)
  ]));
  report.totals([
    ['Subtotal', money(detail.subtotal)],
    ['Desconto', money(detail.discount_amount)],
    ['Total', money(detail.total_amount)]
  ]);
  report.section('Observações');
  report.paragraph(detail.notes || 'Sem observações adicionais.');
  return report.build();
}

export type { ReportDetail };
