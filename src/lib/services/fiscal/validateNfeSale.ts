import { FiscalCompanySettings, FiscalSale } from './types';
import { mapFiscalPaymentMethod } from './FiscalPaymentMapper';

const digitsOnly = (value?: string | null) => (value || '').replace(/\D/g, '');
const taxCode = (parameters: Record<string, unknown> | undefined, key: string) => String(parameters?.[key] || '').trim();

export function validateNfeSale(company: FiscalCompanySettings, sale: FiscalSale) {
  const errors: string[] = [];

  if (digitsOnly(company.cnpj).length !== 14) {
    errors.push('Nao foi possivel emitir a NF-e porque o CNPJ da empresa nao esta configurado corretamente.');
  }

  if ((company.uf || '').toUpperCase() !== 'MT') {
    errors.push('Nao foi possivel emitir a NF-e porque a UF fiscal deve ser MT para a TECNOMOTOS.');
  }

  if (!company.crt) {
    errors.push('Nao foi possivel emitir a NF-e porque o CRT da empresa nao esta configurado.');
  }

  if (!digitsOnly(company.stateRegistration)) {
    errors.push('Nao foi possivel emitir a NF-e porque a Inscricao Estadual da empresa nao esta configurada.');
  }

  if (!/^\d{1,3}$/.test(company.nfeSeries || '')) {
    errors.push('Nao foi possivel emitir a NF-e porque a serie do modelo 55 e invalida.');
  }

  if (sale.documentModel !== '55') {
    errors.push('A emissao de produtos da TECNOMOTOS deve usar NF-e modelo 55.');
  }

  if (!sale.items.length) {
    errors.push('Nao foi possivel emitir a NF-e porque a venda nao possui itens.');
  }

  const recipientDocument = digitsOnly(sale.customerDocument);
  const address = sale.destinationAddress;
  if (![11, 14].includes(recipientDocument.length)) errors.push('Informe CPF ou CNPJ valido do destinatario para emitir NF-e.');
  if (!sale.customerName?.trim()) errors.push('Informe o nome ou razao social do destinatario para emitir NF-e.');
  if (!address?.street?.trim() || !address.number?.trim() || !address.neighborhood?.trim()
      || !address.city?.trim() || !/^[A-Z]{2}$/.test((address.state || '').toUpperCase())
      || digitsOnly(address.postalCode).length !== 8) {
    errors.push('Informe o endereco completo do destinatario para emitir NF-e.');
  }
  if (sale.taxpayerIndicator === 'contributor' && !sale.customerStateRegistration?.trim()) {
    errors.push('Informe a Inscricao Estadual do destinatario contribuinte.');
  }

  try {
    mapFiscalPaymentMethod(sale.paymentMethod);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Forma de pagamento fiscal invalida.');
  }

  sale.items.forEach((item) => {
    const label = item.name || item.sku || item.id;
    if (!item.name) errors.push(`Nao foi possivel emitir a NF-e porque um item da venda esta sem descricao.`);
    if (!item.quantity || item.quantity <= 0) errors.push(`Nao foi possivel emitir a NF-e porque o produto ${label} esta com quantidade invalida.`);
    if (item.unitPrice < 0) errors.push(`Nao foi possivel emitir a NF-e porque o produto ${label} esta com valor invalido.`);
    if (!item.ncm) errors.push(`Nao foi possivel emitir a NF-e porque o produto ${label} nao possui NCM cadastrado.`);
    if (!item.cfop) errors.push(`Nao foi possivel preparar a nota porque nenhuma regra aprovada resolveu o CFOP do produto ${label}.`);
    if (!item.cst && !item.csosn) errors.push(`Nao foi possivel preparar a nota porque nenhuma regra aprovada resolveu o CST/CSOSN do produto ${label}.`);
    if (!item.fiscalRuleId || !item.fiscalRuleVersion) errors.push(`Nao foi possivel preparar a nota porque o produto ${label} nao possui snapshot de regra fiscal.`);
    if (item.origin === null || item.origin === undefined) errors.push(`Nao foi possivel emitir a NF-e porque o produto ${label} nao possui origem fiscal cadastrada.`);
    if (!item.unit) errors.push(`Nao foi possivel emitir a NF-e porque o produto ${label} nao possui unidade fiscal cadastrada.`);
    if (!/^\d{2}$/.test(taxCode(item.taxParameters, 'pis_situacao_tributaria'))) {
      errors.push(`Nao foi possivel preparar a nota porque a regra do produto ${label} nao informa a situacao tributaria do PIS.`);
    }
    if (!/^\d{2}$/.test(taxCode(item.taxParameters, 'cofins_situacao_tributaria'))) {
      errors.push(`Nao foi possivel preparar a nota porque a regra do produto ${label} nao informa a situacao tributaria da COFINS.`);
    }
    const ipiSituation = taxCode(item.taxParameters, 'ipi_situacao_tributaria');
    if (ipiSituation && !/^\d{2}$/.test(ipiSituation)) {
      errors.push(`Nao foi possivel preparar a nota porque a situacao tributaria do IPI do produto ${label} e invalida.`);
    }
    if (ipiSituation && !/^\d{3}$/.test(taxCode(item.taxParameters, 'ipi_codigo_enquadramento_legal'))) {
      errors.push(`Nao foi possivel preparar a nota porque a regra do produto ${label} nao informa o enquadramento legal do IPI.`);
    }
    const ibsCbsClassification = taxCode(item.taxParameters, 'ibs_cbs_classificacao_tributaria');
    if (ibsCbsClassification && !/^\d{3}$/.test(taxCode(item.taxParameters, 'ibs_cbs_situacao_tributaria'))) {
      errors.push(`Nao foi possivel preparar a nota porque a regra do produto ${label} informa a classificacao IBS/CBS sem o CST correspondente.`);
    }
  });

  return errors;
}
