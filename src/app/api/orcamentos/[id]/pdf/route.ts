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

const statusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviado',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  EXPIRED: 'Expirado'
};

const itemTypeLabels: Record<string, string> = {
  PRODUCT: 'Produto',
  SERVICE: 'Serviço',
  PART: 'Peça',
  LABOR: 'Mão de obra'
};

type PdfPage = {
  commands: string[];
};

type TextOptions = {
  size?: number;
  font?: 'regular' | 'bold' | 'italic';
  color?: [number, number, number];
  align?: 'left' | 'right' | 'center';
  maxWidth?: number;
  lineHeight?: number;
};

const pageWidth = 595;
const pageHeight = 842;
const margin = 42;
const contentWidth = pageWidth - margin * 2;
const bottomMargin = 56;

function normalizePdfText(value: unknown) {
  return String(value ?? '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function pdfString(value: unknown) {
  const bytes = Buffer.from(normalizePdfText(value), 'latin1');
  let escaped = '';

  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      escaped += `\\${String.fromCharCode(byte)}`;
    } else if (byte < 0x20 || byte > 0x7e) {
      escaped += `\\${byte.toString(8).padStart(3, '0')}`;
    } else {
      escaped += String.fromCharCode(byte);
    }
  }

  return escaped;
}

function color([r, g, b]: [number, number, number]) {
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function fontRef(font: TextOptions['font']) {
  if (font === 'bold') return 'F2';
  if (font === 'italic') return 'F3';
  return 'F1';
}

function textWidth(text: string, size: number) {
  return normalizePdfText(text).split('').reduce((width, char) => {
    if (char === ' ') return width + size * 0.28;
    if ('il.,:;|!'.includes(char)) return width + size * 0.25;
    if ('mwMW@#%&'.includes(char)) return width + size * 0.78;
    if (char >= 'A' && char <= 'Z') return width + size * 0.62;
    return width + size * 0.5;
  }, 0);
}

function wrapText(text: unknown, maxWidth: number, size: number) {
  const words = normalizePdfText(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words.length ? words : ['-']) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line);

    if (textWidth(word, size) <= maxWidth) {
      line = word;
      continue;
    }

    let chunk = '';
    for (const char of word) {
      const nextChunk = `${chunk}${char}`;
      if (textWidth(nextChunk, size) <= maxWidth) {
        chunk = nextChunk;
      } else {
        if (chunk) lines.push(chunk);
        chunk = char;
      }
    }
    line = chunk;
  }

  if (line) lines.push(line);
  return lines;
}

function rect(x: number, y: number, width: number, height: number, options: { fill?: [number, number, number]; stroke?: [number, number, number]; lineWidth?: number } = {}) {
  const commands: string[] = ['q'];
  if (options.fill) commands.push(`${color(options.fill)} rg`);
  if (options.stroke) {
    commands.push(`${color(options.stroke)} RG`);
    commands.push(`${options.lineWidth ?? 0.7} w`);
  }
  commands.push(`${x} ${y} ${width} ${height} re ${options.fill && options.stroke ? 'B' : options.fill ? 'f' : 'S'}`);
  commands.push('Q');
  return commands.join('\n');
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: [number, number, number] = [0.78, 0.78, 0.78], lineWidth = 0.7) {
  return `q ${color(stroke)} RG ${lineWidth} w ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

function textCommand(text: string, x: number, y: number, options: TextOptions = {}) {
  const size = options.size ?? 10;
  const selectedFont = fontRef(options.font);
  const fill = color(options.color ?? [0.12, 0.12, 0.12]);
  let tx = x;

  if (options.align === 'right' && options.maxWidth) {
    tx = x + options.maxWidth - textWidth(text, size);
  } else if (options.align === 'center' && options.maxWidth) {
    tx = x + (options.maxWidth - textWidth(text, size)) / 2;
  }

  return `BT /${selectedFont} ${size} Tf ${fill} rg ${tx.toFixed(2)} ${y.toFixed(2)} Td (${pdfString(text)}) Tj ET`;
}

function buildPdf(quotation: QuotationRow) {
  const pages: PdfPage[] = [];
  let currentPage: PdfPage;
  let y = pageHeight - margin;

  const addPage = () => {
    currentPage = { commands: [] };
    pages.push(currentPage);
    y = pageHeight - margin;

    if (pages.length > 1) {
      currentPage.commands.push(rect(margin, pageHeight - 54, contentWidth, 1.4, { fill: [0.86, 0.02, 0.02] }));
      currentPage.commands.push(textCommand('TECNOMOTOS', margin, pageHeight - 72, { size: 11, font: 'bold', color: [0.08, 0.08, 0.08] }));
      currentPage.commands.push(textCommand(`Orçamento #${quotation.id.slice(0, 8).toUpperCase()}`, pageWidth - margin - 150, pageHeight - 72, {
        size: 8,
        color: [0.36, 0.36, 0.36],
        align: 'right',
        maxWidth: 150
      }));
      y = pageHeight - 92;
    }
  };

  const add = (command: string) => currentPage.commands.push(command);

  const ensureSpace = (height: number, afterBreak?: () => void) => {
    if (y - height < bottomMargin) {
      addPage();
      afterBreak?.();
    }
  };

  const drawText = (text: string, x: number, drawY: number, options?: TextOptions) => add(textCommand(text, x, drawY, options));

  const drawWrappedText = (text: unknown, x: number, startY: number, width: number, options: TextOptions = {}) => {
    const size = options.size ?? 10;
    const lineHeight = options.lineHeight ?? size + 4;
    const lines = wrapText(text, width, size);

    lines.forEach((wrappedLine, index) => {
      drawText(wrappedLine, x, startY - index * lineHeight, { ...options, maxWidth: width });
    });

    return lines.length * lineHeight;
  };

  const drawDocumentHeader = () => {
    add(rect(0, pageHeight - 94, pageWidth, 94, { fill: [0.05, 0.05, 0.05] }));
    add(rect(margin, pageHeight - 74, 4, 43, { fill: [0.86, 0.02, 0.02] }));
    drawText('TECNOMOTOS', margin + 14, pageHeight - 48, { size: 19, font: 'bold', color: [1, 1, 1] });
    drawText('ORÇAMENTO COMERCIAL', margin + 14, pageHeight - 69, { size: 9, font: 'bold', color: [0.86, 0.02, 0.02] });
    drawText(`#${quotation.id.slice(0, 8).toUpperCase()}`, margin + 14, pageHeight - 84, { size: 8, color: [0.8, 0.8, 0.8] });
    drawText('Proposta para aprovação do cliente', pageWidth - margin - 210, pageHeight - 48, {
      size: 10,
      font: 'bold',
      color: [1, 1, 1],
      align: 'right',
      maxWidth: 210
    });
    drawText(`Emissão: ${date(quotation.created_at)}`, pageWidth - margin - 210, pageHeight - 68, {
      size: 8,
      color: [0.78, 0.78, 0.78],
      align: 'right',
      maxWidth: 210
    });
    y = pageHeight - 122;
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(26);
    drawText(title, margin, y, { size: 10, font: 'bold', color: [0.86, 0.02, 0.02] });
    add(line(margin, y - 8, pageWidth - margin, y - 8, [0.82, 0.82, 0.82], 0.5));
    y -= 26;
  };

  const drawInfoBox = (x: number, boxY: number, width: number, title: string, rows: Array<[string, string]>) => {
    const rowHeight = 18;
    const height = 36 + rows.length * rowHeight;
    add(rect(x, boxY - height, width, height, { fill: [0.98, 0.98, 0.97], stroke: [0.72, 0.72, 0.72], lineWidth: 0.6 }));
    add(rect(x, boxY - 24, width, 24, { fill: [0.93, 0.93, 0.92], stroke: [0.72, 0.72, 0.72], lineWidth: 0.6 }));
    drawText(title, x + 12, boxY - 16, { size: 8, font: 'bold', color: [0.18, 0.18, 0.18] });

    rows.forEach(([label, value], index) => {
      const rowY = boxY - 41 - index * rowHeight;
      drawText(label, x + 12, rowY, { size: 7, font: 'bold', color: [0.42, 0.42, 0.42] });
      drawWrappedText(value || '-', x + 86, rowY, width - 98, { size: 8, color: [0.1, 0.1, 0.1], lineHeight: 10 });
    });

    return height;
  };

  const drawItemsHeader = () => {
    const headerHeight = 24;
    add(rect(margin, y - headerHeight, contentWidth, headerHeight, { fill: [0.08, 0.08, 0.08] }));
    drawText('DESCRIÇÃO', margin + 12, y - 16, { size: 8, font: 'bold', color: [1, 1, 1] });
    drawText('TIPO', margin + 255, y - 16, { size: 8, font: 'bold', color: [1, 1, 1] });
    drawText('QTD', margin + 327, y - 16, { size: 8, font: 'bold', color: [1, 1, 1], align: 'right', maxWidth: 38 });
    drawText('UNITÁRIO', margin + 380, y - 16, { size: 8, font: 'bold', color: [1, 1, 1], align: 'right', maxWidth: 58 });
    drawText('TOTAL', margin + 451, y - 16, { size: 8, font: 'bold', color: [1, 1, 1], align: 'right', maxWidth: 48 });
    y -= headerHeight;
  };

  addPage();
  drawDocumentHeader();
  drawSectionTitle('DADOS DO ORÇAMENTO');

  const boxTop = y;
  const leftRows: Array<[string, string]> = [
    ['Título', quotation.title],
    ['Cliente', quotation.customer_name || 'Sem cliente anexado'],
    ['Contato', quotation.customer_email || quotation.customer_phone || '-']
  ];
  const rightRows: Array<[string, string]> = [
    ['Veículo', quotation.vehicle_info || '-'],
    ['Status', statusLabels[quotation.status] || quotation.status],
    ['Validade', date(quotation.valid_until)]
  ];
  const leftHeight = drawInfoBox(margin, boxTop, 248, 'CLIENTE', leftRows);
  const rightHeight = drawInfoBox(margin + 263, boxTop, 248, 'PROPOSTA', rightRows);
  y -= Math.max(leftHeight, rightHeight) + 28;

  drawSectionTitle('ITENS');
  drawItemsHeader();

  const items = quotation.quotation_items || [];
  if (!items.length) {
    ensureSpace(36, drawItemsHeader);
    add(rect(margin, y - 34, contentWidth, 34, { fill: [1, 1, 1], stroke: [0.84, 0.84, 0.84], lineWidth: 0.5 }));
    drawText('Nenhum item cadastrado neste orçamento.', margin + 12, y - 21, { size: 9, color: [0.32, 0.32, 0.32] });
    y -= 34;
  }

  items.forEach((item, index) => {
    const description = `${index + 1}. ${item.description || 'Item sem descrição'}`;
    const descriptionLines = wrapText(description, 226, 8.5);
    const rowHeight = Math.max(30, 14 + descriptionLines.length * 11);

    ensureSpace(rowHeight, drawItemsHeader);
    add(rect(margin, y - rowHeight, contentWidth, rowHeight, { fill: index % 2 === 0 ? [1, 1, 1] : [0.97, 0.97, 0.96], stroke: [0.86, 0.86, 0.86], lineWidth: 0.45 }));
    descriptionLines.forEach((descriptionLine, lineIndex) => {
      drawText(descriptionLine, margin + 12, y - 18 - lineIndex * 11, { size: 8.5, font: lineIndex === 0 ? 'bold' : 'regular' });
    });
    drawText(itemTypeLabels[item.item_type] || item.item_type || '-', margin + 255, y - 18, { size: 8 });
    drawText(String(item.quantity ?? 0), margin + 327, y - 18, { size: 8, align: 'right', maxWidth: 38 });
    drawText(money(item.unit_price), margin + 380, y - 18, { size: 8, align: 'right', maxWidth: 58 });
    drawText(money(item.total_price), margin + 451, y - 18, { size: 8, font: 'bold', align: 'right', maxWidth: 48 });
    y -= rowHeight;
  });

  ensureSpace(112);
  y -= 18;
  const totalsX = pageWidth - margin - 205;
  add(rect(totalsX, y - 86, 205, 86, { fill: [0.98, 0.98, 0.97], stroke: [0.72, 0.72, 0.72], lineWidth: 0.6 }));
  drawText('RESUMO FINANCEIRO', totalsX + 12, y - 17, { size: 8, font: 'bold', color: [0.36, 0.36, 0.36] });
  drawText('Subtotal', totalsX + 12, y - 39, { size: 9 });
  drawText(money(quotation.subtotal), totalsX + 90, y - 39, { size: 9, align: 'right', maxWidth: 100 });
  drawText('Desconto', totalsX + 12, y - 57, { size: 9 });
  drawText(money(quotation.discount_amount), totalsX + 90, y - 57, { size: 9, align: 'right', maxWidth: 100 });
  add(line(totalsX + 12, y - 66, totalsX + 193, y - 66, [0.72, 0.72, 0.72], 0.5));
  drawText('TOTAL', totalsX + 12, y - 80, { size: 10, font: 'bold' });
  drawText(money(quotation.total_amount), totalsX + 80, y - 80, { size: 12, font: 'bold', color: [0.86, 0.02, 0.02], align: 'right', maxWidth: 110 });
  y -= 110;

  ensureSpace(86);
  drawSectionTitle('OBSERVAÇÕES');
  const notesLines = wrapText(quotation.notes || 'Sem observações adicionais.', contentWidth - 24, 9);
  const notesHeight = Math.max(62, 25 + notesLines.length * 13);
  ensureSpace(notesHeight);
  add(rect(margin, y - notesHeight, contentWidth, notesHeight, { fill: [1, 1, 1], stroke: [0.72, 0.72, 0.72], lineWidth: 0.6 }));
  notesLines.forEach((notesLine, index) => {
    drawText(notesLine, margin + 12, y - 20 - index * 13, { size: 9, color: [0.2, 0.2, 0.2] });
  });
  y -= notesHeight;

  pages.forEach((page, index) => {
    page.commands.push(line(margin, 34, pageWidth - margin, 34, [0.82, 0.82, 0.82], 0.5));
    page.commands.push(textCommand('TECNOMOTOS - Orçamento gerado automaticamente', margin, 20, { size: 7, color: [0.45, 0.45, 0.45] }));
    page.commands.push(textCommand(`Página ${index + 1} de ${pages.length}`, pageWidth - margin - 80, 20, { size: 7, color: [0.45, 0.45, 0.45], align: 'right', maxWidth: 80 }));
  });

  const objects: string[] = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Kids [${pages.map((_, index) => `${3 + index} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`
  ];

  const fontObjectStart = 3 + pages.length;
  const contentObjectStart = fontObjectStart + 3;

  pages.forEach((page, index) => {
    const contentObjectId = contentObjectStart + index;
    objects.push(`${3 + index} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectStart} 0 R /F2 ${fontObjectStart + 1} 0 R /F3 ${fontObjectStart + 2} 0 R >> >> /Contents ${contentObjectId} 0 R >> endobj`);
  });

  objects.push(
    `${fontObjectStart} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj`,
    `${fontObjectStart + 1} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj`,
    `${fontObjectStart + 2} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >> endobj`
  );

  pages.forEach((page, index) => {
    const content = page.commands.join('\n');
    objects.push(`${contentObjectStart + index} 0 obj << /Length ${Buffer.byteLength(content, 'latin1')} >> stream\n${content}\nendstream endobj`);
  });

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
