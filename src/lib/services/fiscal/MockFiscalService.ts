import {
  FiscalService,
  NfceInputData,
  NfceResult,
  NfceSendResult,
  NfceStatusResult,
  NfceCancelResult,
  InvalidateNumberResult,
  SefazStatusResult,
} from './FiscalService';
import { NfceXmlBuilder } from '@/lib/fiscal/sefaz/xmlBuilder';
import { signXml } from '@/lib/fiscal/sefaz/xmlSigner';

export class MockFiscalService extends FiscalService {
  private environment: string;

  constructor() {
    super();
    this.environment = process.env.FISCAL_ENVIRONMENT || 'mock';
  }

  /**
   * Generates a draft XML layout and key in mock mode.
   */
  async createNfce(orderId: string, data: NfceInputData): Promise<NfceResult> {
    console.log(`[Fiscal Mock] Creating NFC-e for Order: ${orderId}. Items count: ${data.items.length}`);
    
    const builder = new NfceXmlBuilder();
    
    // Compile mock order settings for XML layout
    const { xml, accessKey } = builder.buildNfceXml({
      id: orderId,
      series: data.series || '1',
      number: data.number || Math.floor(1 + Math.random() * 9999).toString(),
      cnpj: '00.000.000/0001-00',
      companyName: 'TECNOMOTOS SERVICOS E PECAS SIMULADO LTDA',
      stateRegistration: '123456789',
      crt: '1', // Simples Nacional
      uf: 'MT',
      city: 'Tangará da Serra',
      ibgeCityCode: '5107958',
      items: data.items,
      paymentMethod: data.paymentMethod,
    });

    return {
      success: true,
      documentId: `mock_doc_${Math.random().toString(36).substring(2, 10)}`,
      invoiceNumber: data.number || '1',
      series: data.series || '1',
      accessKey,
      xml,
      status: 'DRAFT',
    };
  }

  /**
   * Mock XML digital signatures.
   */
  async signNfce(xml: string, tagToSign: string): Promise<string> {
    console.log(`[Fiscal Mock] Signing XML element tag: ${tagToSign}`);
    return signXml(xml, tagToSign);
  }

  /**
   * Mock document transmission to SEFAZ.
   */
  async sendNfce(documentId: string): Promise<NfceSendResult> {
    console.log(`[Fiscal Mock] Transmitting NFC-e doc: ${documentId} to mock Sefaz.`);
    
    return {
      success: true,
      xmlUrl: `https://api.tecnomotos.com.br/fiscal/xml/${documentId}.xml`,
      danfeUrl: `https://api.tecnomotos.com.br/fiscal/danfe/${documentId}.pdf`,
      status: 'AUTHORIZED',
      protocol: '351234567890123',
      sefazCode: '100',
      sefazMessage: 'Autorizado o uso da NF-e (SIMULADO)',
      signedXml: '<signed_xml_mock/>',
      authorizedXml: '<authorized_xml_mock/>',
    };
  }

  /**
   * Mock key queries.
   */
  async queryNfce(accessKey: string): Promise<NfceStatusResult> {
    console.log(`[Fiscal Mock] Querying Sefaz status for accessKey: ${accessKey}`);
    return {
      accessKey,
      status: 'AUTHORIZED',
      protocol: '351234567890123',
      sefazCode: '100',
      sefazMessage: 'Autorizado o uso da NF-e (SIMULADO)',
      authorizedAt: new Date().toISOString(),
    };
  }

  /**
   * Local status lookup.
   */
  async getNfceStatus(documentId: string): Promise<NfceStatusResult> {
    console.log(`[Fiscal Mock] Fetching local document status: ${documentId}`);
    return {
      status: 'AUTHORIZED',
      sefazCode: '100',
      sefazMessage: 'Autorizado o uso da NF-e (SIMULADO)',
    };
  }

  /**
   * Mock cancellations.
   */
  async cancelNfce(documentId: string, reason: string): Promise<NfceCancelResult> {
    console.log(`[Fiscal Mock] Requesting cancellation for doc: ${documentId}. Reason: ${reason}`);
    return {
      success: true,
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
      protocol: '135123456789012',
      sefazCode: '101',
      sefazMessage: 'Cancelamento de homologação autorizado (SIMULADO)',
    };
  }

  /**
   * Mock Inutilizações.
   */
  async invalidateNfceNumber(
    series: string,
    startNumber: number,
    endNumber: number,
    _justification: string
  ): Promise<InvalidateNumberResult> {
    console.log(`[Fiscal Mock] Invalidation requested for numbers: ${startNumber}-${endNumber} Series: ${series}`);
    return {
      success: true,
      protocol: '151234567890123',
      sefazCode: '102',
      sefazMessage: 'Inutilização de número homologada (SIMULADO)',
    };
  }

  /**
   * Mock SEFAZ service health query.
   */
  async getServiceStatus(): Promise<SefazStatusResult> {
    return {
      status: 'ONLINE',
      lastCheck: new Date().toISOString(),
      environment: this.environment,
    };
  }

  /**
   * Mock events processing.
   */
  async processEvent(
    documentId: string,
    eventType: string,
    _payload: Record<string, unknown>
  ): Promise<{ success: boolean; protocol?: string; sefazCode: string; sefazMessage: string }> {
    console.log(`[Fiscal Mock] Processing event: ${eventType} for doc: ${documentId}`);
    return {
      success: true,
      protocol: '135123456789013',
      sefazCode: '135',
      sefazMessage: 'Evento registrado e vinculado a NF-e (SIMULADO)',
    };
  }
}
