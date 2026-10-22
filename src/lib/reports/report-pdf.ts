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

type ReportDetail = SaleReportDetail | ServiceReportDetail;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '-';
const safe = (value: unknown) => String(value ?? '-')
  .replace(/[–—]/g, '-')
  .replace(/[^\x20-\xFF]/g, '')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

function wrap(value: unknown, maxChars: number) {
  const words = String(value ?? '-').replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
}

class PdfReport {
  private pages: string[][] = [[]];
  private pageIndex = 0;
  private y = PAGE_HEIGHT - 104;

  constructor(private readonly title: string, private readonly reference: string) {
    this.drawHeader();
  }

  private get page() {
    return this.pages[this.pageIndex];
  }

  private text(x: number, y: number, value: unknown, size = 9, font = 'F1', color = '0.12 0.12 0.12') {
    this.page.push(`${color} rg BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${safe(value)}) Tj ET`);
  }

  private line(x1: number, y1: number, x2: number, y2: number, color = '0.82 0.82 0.82', width = 0.6) {
    this.page.push(`${color} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  private rect(x: number, y: number, width: number, height: number, fill: string) {
    this.page.push(`${fill} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }

  private drawHeader() {
    this.rect(0, PAGE_HEIGHT - 72, PAGE_WIDTH, 72, '0.04 0.04 0.04');
    this.rect(0, PAGE_HEIGHT - 76, PAGE_WIDTH, 4, '0.88 0.02 0.02');
    this.text(MARGIN, PAGE_HEIGHT - 31, 'TECNOMOTOS', 18, 'F2', '1 1 1');
    this.text(MARGIN, PAGE_HEIGHT - 51, this.title.toUpperCase(), 10, 'F2', '0.95 0.95 0.95');
    this.text(PAGE_WIDTH - MARGIN - 142, PAGE_HEIGHT - 42, this.reference, 9, 'F2', '0.92 0.08 0.08');
  }

  private newPage() {
    this.pages.push([]);
    this.pageIndex += 1;
    this.y = PAGE_HEIGHT - 104;
    this.drawHeader();
  }

  private ensure(height: number) {
    if (this.y - height < 58) this.newPage();
  }

  section(title: string) {
    this.ensure(34);
    this.y -= 5;
    this.rect(MARGIN, this.y - 17, CONTENT_WIDTH, 22, '0.95 0.95 0.95');
    this.rect(MARGIN, this.y - 17, 4, 22, '0.88 0.02 0.02');
    this.text(MARGIN + 12, this.y - 10, title.toUpperCase(), 10, 'F2');
    this.y -= 32;
  }

  fields(entries: Array<[string, unknown]>) {
    const columnWidth = CONTENT_WIDTH / 2;
    for (let index = 0; index < entries.length; index += 2) {
      this.ensure(36);
      const row = entries.slice(index, index + 2);
      row.forEach(([label, value], column) => {
        const x = MARGIN + column * columnWidth;
        this.text(x, this.y, label.toUpperCase(), 7, 'F2', '0.42 0.42 0.42');
        const valueLines = wrap(value, 43).slice(0, 2);
        valueLines.forEach((line, lineIndex) => this.text(x, this.y - 13 - lineIndex * 11, line, 9));
      });
      this.y -= 38;
      this.line(MARGIN, this.y + 8, PAGE_WIDTH - MARGIN, this.y + 8, '0.9 0.9 0.9', 0.4);
    }
  }

  paragraph(value: unknown) {
    const lines = wrap(value, 95);
    this.ensure(lines.length * 12 + 10);
    lines.forEach((line, index) => this.text(MARGIN, this.y - index * 12, line, 9));
    this.y -= lines.length * 12 + 12;
  }

  table(headers: string[], rows: string[][], widths: number[]) {
    const drawTableHeader = () => {
      this.ensure(28);
      this.rect(MARGIN, this.y - 19, CONTENT_WIDTH, 25, '0.12 0.12 0.12');
      let x = MARGIN + 6;
      headers.forEach((header, index) => {
        this.text(x, this.y - 11, header.toUpperCase(), 7, 'F2', '1 1 1');
        x += widths[index];
      });
      this.y -= 25;
    };

    drawTableHeader();
    for (const row of rows) {
      const wrapped = row.map((cell, index) => wrap(cell, Math.max(8, Math.floor(widths[index] / 5.2))).slice(0, 3));
      const height = Math.max(28, Math.max(...wrapped.map((lines) => lines.length)) * 11 + 10);
      if (this.y - height < 58) {
        this.newPage();
        drawTableHeader();
      }
      let x = MARGIN + 6;
      wrapped.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => this.text(x, this.y - 16 - lineIndex * 10, line, 8));
        x += widths[index];
      });
      this.line(MARGIN, this.y - height, PAGE_WIDTH - MARGIN, this.y - height, '0.86 0.86 0.86', 0.4);
      this.y -= height;
    }
    this.y -= 10;
  }

  total(label: string, value: string) {
    this.ensure(38);
    this.rect(PAGE_WIDTH - MARGIN - 220, this.y - 22, 220, 30, '0.95 0.95 0.95');
    this.text(PAGE_WIDTH - MARGIN - 208, this.y - 12, label.toUpperCase(), 8, 'F2', '0.35 0.35 0.35');
    this.text(PAGE_WIDTH - MARGIN - 90, this.y - 12, value, 11, 'F2', '0.82 0.02 0.02');
    this.y -= 42;
  }

  build() {
    this.pages.forEach((commands, index) => {
      commands.push(`0.45 0.45 0.45 rg BT /F1 7 Tf ${MARGIN} 28 Td (TECNOMOTOS - Documento gerado em ${safe(dateTime(new Date().toISOString()))}) Tj ET`);
      commands.push(`0.45 0.45 0.45 rg BT /F2 7 Tf ${PAGE_WIDTH - MARGIN - 70} 28 Td (Pagina ${index + 1} de ${this.pages.length}) Tj ET`);
    });
    return encodePdf(this.pages);
  }
}

function encodePdf(pages: string[][]) {
  const objects: string[] = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Kids [${pages.map((_, index) => `${3 + index} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`
  ];
  const fontStart = 3 + pages.length;
  const contentStart = fontStart + 2;
  pages.forEach((_, index) => objects.push(`${3 + index} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontStart} 0 R /F2 ${fontStart + 1} 0 R >> >> /Contents ${contentStart + index} 0 R >> endobj`));
  objects.push(
    `${fontStart} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj`,
    `${fontStart + 1} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj`
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

export function buildSaleReportPdf(detail: SaleReportDetail) {
  const report = new PdfReport('Comprovante detalhado de venda', `VENDA #${detail.id.slice(0, 8).toUpperCase()}`);
  report.section('Informações da venda');
  report.fields([
    ['Código', detail.id], ['Status', detail.status],
    ['Canal', detail.salesChannel], ['Pagamento', detail.paymentMethod || '-'],
    ['Criada em', dateTime(detail.createdAt)], ['Pagamento em', dateTime(detail.paymentDate)]
  ]);
  report.section('Cliente');
  report.fields([
    ['Nome', detail.customer.name], ['Documento', detail.customer.document || '-'],
    ['E-mail', detail.customer.email || '-'], ['Telefone', detail.customer.phone || '-'],
    ['Endereço', detail.customer.address || '-']
  ]);
  report.section('Itens da venda');
  report.table(
    ['SKU', 'Produto', 'Qtd.', 'Unitário', 'Total'],
    detail.items.map((item) => [item.sku || '-', item.name, String(item.quantity), money(item.unitPrice), money(item.total)]),
    [72, 220, 48, 82, 77]
  );
  report.total('Valor total', money(detail.total));
  if (detail.notes) {
    report.section('Observações');
    report.paragraph(detail.notes);
  }
  return report.build();
}

export function buildServiceReportPdf(detail: ServiceReportDetail) {
  const report = new PdfReport('Relatório detalhado de serviço', `OS #${detail.id.slice(0, 8).toUpperCase()}`);
  report.section('Informações do serviço');
  report.fields([
    ['Código', detail.id], ['Status', detail.status],
    ['Serviço', detail.serviceType], ['Mecânico', detail.mechanic || 'Não alocado'],
    ['Criada em', dateTime(detail.createdAt)], ['Atualizada em', dateTime(detail.updatedAt)]
  ]);
  report.section('Cliente');
  report.fields([
    ['Nome', detail.customer.name], ['Documento', detail.customer.document || '-'],
    ['E-mail', detail.customer.email || '-'], ['Telefone', detail.customer.phone || '-'],
    ['Endereço', detail.customer.address || '-']
  ]);
  if (detail.vehicle) {
    report.section('Motocicleta');
    report.fields([
      ['Marca / modelo', `${detail.vehicle.brand || '-'} ${detail.vehicle.model || ''}`.trim()], ['Ano', detail.vehicle.year || '-'],
      ['Placa', detail.vehicle.plate || '-'], ['Cor', detail.vehicle.color || '-'],
      ['Chassi', detail.vehicle.vin || '-'], ['Quilometragem', detail.vehicle.mileage != null ? `${detail.vehicle.mileage} km` : '-']
    ]);
  }
  report.section('Descrição');
  report.paragraph(detail.description || '-');
  if (detail.products.length) {
    report.section('Peças e produtos utilizados');
    report.table(
      ['SKU', 'Produto', 'Qtd.', 'Unitário', 'Total'],
      detail.products.map((item) => [item.sku || '-', item.name, String(item.quantity), money(item.unitPrice), money(item.total)]),
      [72, 220, 48, 82, 77]
    );
  }
  if (detail.checklist.length) {
    report.section('Checklist técnico');
    report.table(
      ['Item', 'Situação', 'Observações'],
      detail.checklist.map((item) => [item.label, item.status, item.notes || '-']),
      [195, 90, 214]
    );
  }
  report.total('Valor total', money(detail.total));
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

export type { ReportDetail };
