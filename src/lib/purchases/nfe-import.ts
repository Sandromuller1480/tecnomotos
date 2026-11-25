export interface NfeSupplierData {
  legalName: string;
  tradeName: string;
  document: string;
  stateRegistration: string;
  city: string;
  state: string;
}

export interface NfeItemData {
  lineNumber: string;
  supplierCode: string;
  gtin: string;
  name: string;
  ncm: string;
  cest: string;
  fiscalOrigin: string;
  commercialUnit: string;
  taxableUnit: string;
  quantity: number;
  unitCost: number;
}

export interface NfeImportData {
  accessKey: string;
  invoiceNumber: string;
  series: string;
  issueDate: string;
  dueDate: string;
  freight: number;
  discount: number;
  total: number;
  supplier: NfeSupplierData;
  items: NfeItemData[];
}

const elementText = (parent: Element, tagName: string) =>
  parent.getElementsByTagNameNS('*', tagName)[0]?.textContent?.trim() || '';

const numericValue = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const digitsOnly = (value: string) => value.replace(/\D/g, '');

export async function parseNfeXml(file: File): Promise<NfeImportData> {
  if (!file.name.toLocaleLowerCase('pt-BR').endsWith('.xml')) {
    throw new Error('Selecione um arquivo XML de NF-e.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('O XML da NF-e deve ter no máximo 5 MB.');
  }

  const xmlText = await file.text();
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlText)) {
    throw new Error('O XML possui declarações externas não permitidas.');
  }

  const document = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('O arquivo XML está malformado ou corrompido.');
  }

  const info = document.getElementsByTagNameNS('*', 'infNFe')[0];
  if (!info) throw new Error('O arquivo não contém uma NF-e válida.');

  const ide = info.getElementsByTagNameNS('*', 'ide')[0];
  const model = ide ? elementText(ide, 'mod') : '';
  if (model && model !== '55') throw new Error('Envie o XML de uma NF-e modelo 55.');

  const protocol = document.getElementsByTagNameNS('*', 'infProt')[0];
  const authorizationStatus = protocol ? elementText(protocol, 'cStat') : '';
  if (authorizationStatus && !['100', '150'].includes(authorizationStatus)) {
    throw new Error(`A NF-e não está autorizada para uso (status ${authorizationStatus}).`);
  }

  const supplierElement = info.getElementsByTagNameNS('*', 'emit')[0];
  if (!supplierElement) throw new Error('O emitente da NF-e não foi encontrado.');
  const supplierAddress = supplierElement.getElementsByTagNameNS('*', 'enderEmit')[0];
  const supplier: NfeSupplierData = {
    legalName: elementText(supplierElement, 'xNome'),
    tradeName: elementText(supplierElement, 'xFant'),
    document: digitsOnly(elementText(supplierElement, 'CNPJ') || elementText(supplierElement, 'CPF')),
    stateRegistration: elementText(supplierElement, 'IE'),
    city: supplierAddress ? elementText(supplierAddress, 'xMun') : '',
    state: supplierAddress ? elementText(supplierAddress, 'UF') : ''
  };
  if (!supplier.legalName) throw new Error('A razão social do emitente não foi encontrada no XML.');

  const itemElements = Array.from(info.getElementsByTagNameNS('*', 'det'));
  const items = itemElements.map((itemElement, index) => {
    const product = itemElement.getElementsByTagNameNS('*', 'prod')[0];
    const icms = itemElement.getElementsByTagNameNS('*', 'ICMS')[0];
    const quantity = product ? numericValue(elementText(product, 'qCom') || elementText(product, 'qTrib')) : 0;
    const unitCost = product ? numericValue(elementText(product, 'vUnCom') || elementText(product, 'vUnTrib')) : 0;
    const gtin = product
      ? digitsOnly(elementText(product, 'cEANTrib')) || digitsOnly(elementText(product, 'cEAN'))
      : '';
    return {
      lineNumber: itemElement.getAttribute('nItem') || String(index + 1),
      supplierCode: product ? elementText(product, 'cProd') : '',
      gtin,
      name: product ? elementText(product, 'xProd') : '',
      ncm: digitsOnly(product ? elementText(product, 'NCM') : ''),
      cest: digitsOnly(product ? elementText(product, 'CEST') : ''),
      fiscalOrigin: icms ? elementText(icms, 'orig') : '',
      commercialUnit: product ? elementText(product, 'uCom').toUpperCase() : '',
      taxableUnit: product ? elementText(product, 'uTrib').toUpperCase() : '',
      quantity,
      unitCost
    };
  }).filter((item) => item.name && item.quantity > 0 && item.unitCost >= 0);
  if (items.length === 0) throw new Error('Nenhum produto válido foi encontrado na NF-e.');

  const totalElement = info.getElementsByTagNameNS('*', 'ICMSTot')[0];
  const protocolAccessKey = protocol ? digitsOnly(elementText(protocol, 'chNFe')) : '';
  const idAccessKey = digitsOnly(info.getAttribute('Id') || '').slice(-44);
  const accessKey = protocolAccessKey || idAccessKey;
  if (accessKey.length !== 44) throw new Error('A chave de acesso de 44 dígitos não foi encontrada no XML.');

  const issuedAt = ide ? elementText(ide, 'dhEmi') || elementText(ide, 'dEmi') : '';
  const billing = info.getElementsByTagNameNS('*', 'dup')[0];
  return {
    accessKey,
    invoiceNumber: ide ? elementText(ide, 'nNF') : '',
    series: ide ? elementText(ide, 'serie') : '',
    issueDate: /^\d{4}-\d{2}-\d{2}/.test(issuedAt) ? issuedAt.slice(0, 10) : '',
    dueDate: billing ? elementText(billing, 'dVenc') : '',
    freight: totalElement ? numericValue(elementText(totalElement, 'vFrete')) : 0,
    discount: totalElement ? numericValue(elementText(totalElement, 'vDesc')) : 0,
    total: totalElement ? numericValue(elementText(totalElement, 'vNF')) : 0,
    supplier,
    items
  };
}
