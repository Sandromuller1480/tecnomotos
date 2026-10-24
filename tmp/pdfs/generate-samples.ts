import { writeFileSync } from 'node:fs';
import {
  buildQuotationReportPdf,
  buildSaleReportPdf,
  buildServiceReportPdf
} from '../../src/lib/reports/report-pdf';

const customer = {
  name: 'ANA KELLY PEREIRA BEZERRA',
  email: 'ana.kelly@example.com',
  phone: '(65) 99938-0973',
  document: '123.456.789-00',
  address: 'Rua dos Mognos, 1219 - Jardim dos Ipês, Tangará da Serra/MT - 78307-216'
};

writeFileSync('output/pdf/amostra-venda-novo-modelo.pdf', buildSaleReportPdf({
  kind: 'sale', id: 'f7d51ce8-bff3-409a-be65-fe0cfb410f88', status: 'Pago', salesChannel: 'Balcão',
  paymentMethod: 'Dinheiro', paymentDate: '2026-10-22T11:17:36-04:00', createdAt: '2026-10-22T11:17:36-04:00',
  notes: 'Cliente retirou os produtos no balcão.', total: 665, customer,
  items: [
    { sku: 'SKU-234270', name: 'Engrenagem conta-giro Suzuki Yes', quantity: 1, unitPrice: 250, total: 250 },
    { sku: 'SKU-100125', name: 'Kit relação Biz 100 35/15/428H 1045', quantity: 1, unitPrice: 140, total: 140 },
    { sku: 'SKU-201824', name: 'Tampa capa seta Biz 125/2018-2024', quantity: 1, unitPrice: 80, total: 80 }
  ]
}));

writeFileSync('output/pdf/amostra-servico-novo-modelo.pdf', buildServiceReportPdf({
  kind: 'service', id: 'a194d433-1de8-4f93-9eef-73b12250e540', status: 'Em andamento', serviceType: 'Manutenção preventiva',
  description: 'Revisão completa, troca de óleo e regulagem do sistema de freios.', notes: 'Retorno recomendado após 1.000 km.',
  total: 410, createdAt: '2026-10-22T09:00:00-04:00', updatedAt: '2026-10-23T14:30:00-04:00', customer,
  vehicle: { brand: 'Honda', model: 'CG 160 Titan', year: 2023, plate: 'ABC1D23', color: 'Vermelha', vin: '9C2KC2200PR000001', mileage: 18450 },
  mechanic: 'Carlos da Oficina',
  products: [
    { sku: 'OLEO-10W30', name: 'Óleo de motor 10W30', quantity: 1, unitPrice: 60, total: 60 },
    { sku: 'PAST-CG160', name: 'Pastilha de freio dianteira', quantity: 1, unitPrice: 100, total: 100 }
  ],
  checklist: [
    { label: 'Sistema de freios', status: 'Concluído', notes: 'Pastilha dianteira substituída' },
    { label: 'Transmissão', status: 'Atenção', notes: 'Reavaliar tensão da corrente no retorno' }
  ],
  photos: [{ url: 'https://example.com/foto-atendimento.jpg', caption: 'Condição na entrada' }]
}));

writeFileSync('output/pdf/amostra-orcamento-novo-modelo.pdf', buildQuotationReportPdf({
  id: '1355aabb-ccdd-4eef-9012-123456789abc', customer_name: customer.name, customer_email: customer.email,
  customer_phone: customer.phone, title: 'Revisão completa da motocicleta', vehicle_info: 'Honda CG 160 Titan 2023 - ABC1D23',
  status: 'SENT', valid_until: '2026-11-10', subtotal: 665, discount_amount: 35, total_amount: 630,
  notes: 'Orçamento válido até a data indicada. Peças sujeitas à disponibilidade em estoque.', created_at: '2026-10-24T08:00:00-04:00',
  quotation_items: [
    { description: 'Kit relação Biz 100 35/15/428H 1045', item_type: 'PRODUCT', quantity: 1, unit_price: 140, total_price: 140 },
    { description: 'Óleo de suspensão', item_type: 'PRODUCT', quantity: 2, unit_price: 20, total_price: 40 },
    { description: 'Serviço de manutenção e lavagem', item_type: 'SERVICE', quantity: 1, unit_price: 250, total_price: 250 }
  ]
}));
