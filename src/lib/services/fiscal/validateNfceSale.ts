import { FiscalCompanySettings, FiscalSale } from './types';
import { mapFiscalPaymentMethod } from './FiscalPaymentMapper';

const digitsOnly = (value?: string | null) => (value || '').replace(/\D/g, '');

export function validateNfceSale(company: FiscalCompanySettings, sale: FiscalSale) {
  const errors: string[] = [];

  if (digitsOnly(company.cnpj).length !== 14) {
    errors.push('Nao foi possivel emitir a NFC-e porque o CNPJ da empresa nao esta configurado corretamente.');
  }

  if ((company.uf || '').toUpperCase() !== 'MT') {
    errors.push('Nao foi possivel emitir a NFC-e porque a UF fiscal deve ser MT para a TECNOMOTOS.');
  }

  if (!company.crt) {
    errors.push('Nao foi possivel emitir a NFC-e porque o CRT da empresa nao esta configurado.');
  }

  if (!sale.items.length) {
    errors.push('Nao foi possivel emitir a NFC-e porque a venda nao possui itens.');
  }

  try {
    mapFiscalPaymentMethod(sale.paymentMethod);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Forma de pagamento fiscal invalida.');
  }

  sale.items.forEach((item) => {
    const label = item.name || item.sku || item.id;
    if (!item.name) errors.push(`Nao foi possivel emitir a NFC-e porque um item da venda esta sem descricao.`);
    if (!item.quantity || item.quantity <= 0) errors.push(`Nao foi possivel emitir a NFC-e porque o produto ${label} esta com quantidade invalida.`);
    if (item.unitPrice < 0) errors.push(`Nao foi possivel emitir a NFC-e porque o produto ${label} esta com valor invalido.`);
    if (!item.ncm) errors.push(`Nao foi possivel emitir a NFC-e porque o produto ${label} nao possui NCM cadastrado.`);
    if (!item.cfop) errors.push(`Nao foi possivel preparar a nota porque nenhuma regra aprovada resolveu o CFOP do produto ${label}.`);
    if (!item.cst && !item.csosn) errors.push(`Nao foi possivel preparar a nota porque nenhuma regra aprovada resolveu o CST/CSOSN do produto ${label}.`);
    if (!item.fiscalRuleId || !item.fiscalRuleVersion) errors.push(`Nao foi possivel preparar a nota porque o produto ${label} nao possui snapshot de regra fiscal.`);
    if (item.origin === null || item.origin === undefined) errors.push(`Nao foi possivel emitir a NFC-e porque o produto ${label} nao possui origem fiscal cadastrada.`);
    if (!item.unit) errors.push(`Nao foi possivel emitir a NFC-e porque o produto ${label} nao possui unidade fiscal cadastrada.`);
  });

  return errors;
}
