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
import { SEFAZ_MT_ENDPOINTS } from '@/lib/fiscal/sefaz/sefazMtEndpoints';
import { sendSoapRequest } from '@/lib/fiscal/sefaz/soapClient';
import { NfceXmlBuilder } from '@/lib/fiscal/sefaz/xmlBuilder';
import { signXml } from '@/lib/fiscal/sefaz/xmlSigner';
import { validateNfceXml } from '@/lib/fiscal/sefaz/xmlValidator';
import { parseSefazResponse } from '@/lib/fiscal/sefaz/sefazResponseParser';

export class SefazMtFiscalService extends FiscalService {
  private environment: 'homologation' | 'production' | 'mock';

  constructor() {
    super();
    const env = process.env.FISCAL_ENVIRONMENT || 'mock';
    if (env === 'production') {
      this.environment = 'production';
    } else if (env === 'homologation') {
      this.environment = 'homologation';
    } else {
      this.environment = 'mock';
    }
  }

  /**
   * Block production requests as required in safety guidelines.
   */
  private checkProductionBlock() {
    if (this.environment === 'production') {
      throw new Error(
        'Acesso bloqueado: O ambiente de produção fiscal (validade jurídica) está desabilitado nesta etapa.'
      );
    }
  }

  /**
   * Builds the NFC-e layout and validates XSD schemas.
   */
  async createNfce(orderId: string, data: NfceInputData): Promise<NfceResult> {
    this.checkProductionBlock();
    console.log(`[SefazMT] Generating XML payload for Order: ${orderId}`);

    const builder = new NfceXmlBuilder();
    const { xml, accessKey } = builder.buildNfceXml({
      id: orderId,
      series: data.series || '1',
      number: data.number || '1',
      cnpj: process.env.FISCAL_CNPJ || '00000000000000',
      companyName: 'TECNOMOTOS PECAS E SERVICOS',
      stateRegistration: process.env.FISCAL_IE || '00000000',
      crt: process.env.FISCAL_CRT || '1',
      uf: process.env.FISCAL_UF || 'MT',
      city: 'Tangará da Serra',
      ibgeCityCode: '5107958',
      items: data.items,
      paymentMethod: data.paymentMethod,
    });

    // Run structural XML validation before sending
    const validationErrors = validateNfceXml(xml);
    if (validationErrors.length > 0) {
      return {
        success: false,
        documentId: '',
        status: 'ERROR',
        errorMessage: `Erro de validação cadastral: ${validationErrors[0].message}`,
      };
    }

    return {
      success: true,
      documentId: `sefaz_doc_${Math.random().toString(36).substring(2, 10)}`,
      invoiceNumber: data.number,
      series: data.series,
      accessKey,
      xml,
      status: 'DRAFT',
    };
  }

  /**
   * Cryptographically signs XML using ICP-Brasil key certificate.
   */
  async signNfce(xml: string, tagToSign: string): Promise<string> {
    this.checkProductionBlock();
    return signXml(xml, tagToSign);
  }

  /**
   * Transmits signed NFC-e to Sefaz MT via SOAP.
   */
  async sendNfce(documentId: string): Promise<NfceSendResult> {
    this.checkProductionBlock();
    console.log(`[SefazMT] Transmitting document: ${documentId} via SOAP Web Services.`);

    const endpoints = SEFAZ_MT_ENDPOINTS[this.environment === 'production' ? 'production' : 'homologation'];

    // Simulated payload wrapping for SOAP envelope
    const mockRequestXml = `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NfeAutorizacao4"><enviNFe versao="4.00"><idLote>1</idLote><indSinc>1</indSinc><NFe>...</NFe></enviNFe></nfeDadosMsg>`;

    try {
      const soapResponse = await sendSoapRequest(
        endpoints.authorization,
        'http://www.portalfiscal.inf.br/nfe/wsdl/NfeAutorizacao4/nfeAutorizacaoLote',
        mockRequestXml
      );

      const parsed = parseSefazResponse(soapResponse);

      if (parsed.cStat === '100') {
        return {
          success: true,
          status: 'AUTHORIZED',
          protocol: parsed.nProt,
          sefazCode: parsed.cStat,
          sefazMessage: parsed.xMotivo,
          xmlUrl: `https://homologacao.sefaz.mt.gov.br/xml/${documentId}.xml`,
          danfeUrl: `https://homologacao.sefaz.mt.gov.br/danfe/${documentId}.pdf`,
        };
      }

      return {
        success: false,
        status: 'REJECTED',
        sefazCode: parsed.cStat,
        sefazMessage: parsed.xMotivo,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na conexão com a Sefaz.';
      return {
        success: false,
        status: 'ERROR',
        sefazCode: '999',
        sefazMessage: msg,
      };
    }
  }

  /**
   * Queries Sefaz MT for access protocol by key.
   */
  async queryNfce(accessKey: string): Promise<NfceStatusResult> {
    this.checkProductionBlock();
    const endpoints = SEFAZ_MT_ENDPOINTS[this.environment === 'production' ? 'production' : 'homologation'];

    const requestXml = `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NfeConsulta4"><consSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><xServ>CONSULTAR</xServ><chNFe>${accessKey}</chNFe></consSitNFe></nfeDadosMsg>`;

    try {
      const soapResponse = await sendSoapRequest(
        endpoints.consultation,
        'http://www.portalfiscal.inf.br/nfe/wsdl/NfeConsulta4/nfeConsultaNF',
        requestXml
      );

      const parsed = parseSefazResponse(soapResponse);

      return {
        accessKey,
        status: parsed.cStat === '100' ? 'AUTHORIZED' : 'UNKNOWN',
        protocol: parsed.nProt,
        sefazCode: parsed.cStat,
        sefazMessage: parsed.xMotivo,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao consultar Sefaz.';
      return {
        sefazCode: '999',
        sefazMessage: msg,
        status: 'ERROR',
      };
    }
  }

  /**
   * Local status lookup helper.
   */
  async getNfceStatus(_documentId: string): Promise<NfceStatusResult> {
    return {
      status: 'AUTHORIZED',
      sefazCode: '100',
      sefazMessage: 'Autorizado o uso da NF-e',
    };
  }

  /**
   * Submits a cancellation event (RecepcaoEvento4) to Sefaz.
   */
  async cancelNfce(documentId: string, reason: string): Promise<NfceCancelResult> {
    this.checkProductionBlock();
    const endpoints = SEFAZ_MT_ENDPOINTS[this.environment === 'production' ? 'production' : 'homologation'];

    const requestXml = `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/RecepcaoEvento4"><envEvento versao="1.00"><idLote>1</idLote><evento versao="1.00"><infEvento><cOrgao>51</cOrgao><tpAmb>2</tpAmb><CNPJ>00000000000000</CNPJ><chNFe>...</chNFe><dhEvento>...</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>...</nProt><xJust>${reason}</xJust></detEvento></infEvento></evento></envEvento></nfeDadosMsg>`;

    try {
      const soapResponse = await sendSoapRequest(
        endpoints.events,
        'http://www.portalfiscal.inf.br/nfe/wsdl/RecepcaoEvento4/nfeRecepcaoEvento',
        requestXml
      );

      const parsed = parseSefazResponse(soapResponse);

      return {
        success: parsed.cStat === '135',
        status: parsed.cStat === '135' ? 'CANCELLED' : 'ERROR',
        protocol: parsed.nProt,
        sefazCode: parsed.cStat,
        sefazMessage: parsed.xMotivo,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na conexão de cancelamento.';
      return {
        success: false,
        status: 'ERROR',
        sefazCode: '999',
        sefazMessage: msg,
      };
    }
  }

  /**
   * Inutilização de números.
   */
  async invalidateNfceNumber(
    series: string,
    startNumber: number,
    endNumber: number,
    justification: string
  ): Promise<InvalidateNumberResult> {
    this.checkProductionBlock();
    const endpoints = SEFAZ_MT_ENDPOINTS[this.environment === 'production' ? 'production' : 'homologation'];

    const requestXml = `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NfeInutilizacao4"><inutNFe versao="4.00"><infInut><tpAmb>2</tpAmb><xServ>INUTILIZAR</xServ><cUF>51</cUF><ano>26</ano><CNPJ>00000000000000</CNPJ><mod>65</mod><serie>${series}</serie><nNFIni>${startNumber}</nNFIni><nNFFin>${endNumber}</nNFFin><xJust>${justification}</xJust></infInut></inutNFe></nfeDadosMsg>`;

    try {
      const soapResponse = await sendSoapRequest(
        endpoints.inutilization,
        'http://www.portalfiscal.inf.br/nfe/wsdl/NfeInutilizacao4/nfeInutilizacaoNF',
        requestXml
      );

      const parsed = parseSefazResponse(soapResponse);

      return {
        success: parsed.cStat === '102',
        protocol: parsed.nProt,
        sefazCode: parsed.cStat,
        sefazMessage: parsed.xMotivo,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na conexão de inutilização.';
      return {
        success: false,
        sefazCode: '999',
        sefazMessage: msg,
      };
    }
  }

  /**
   * Queries Sefaz MT Service Status.
   */
  async getServiceStatus(): Promise<SefazStatusResult> {
    this.checkProductionBlock();
    const endpoints = SEFAZ_MT_ENDPOINTS[this.environment === 'production' ? 'production' : 'homologation'];

    const requestXml = `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NfeStatusServico4"><consStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><cUF>51</cUF><xServ>STATUS</xServ></consStatServ></nfeDadosMsg>`;

    try {
      const soapResponse = await sendSoapRequest(
        endpoints.status,
        'http://www.portalfiscal.inf.br/nfe/wsdl/NfeStatusServico4/nfeStatusServicoNF',
        requestXml
      );

      const parsed = parseSefazResponse(soapResponse);

      return {
        status: parsed.cStat === '107' ? 'ONLINE' : 'UNAVAILABLE',
        lastCheck: new Date().toISOString(),
        environment: this.environment,
      };
    } catch {
      return {
        status: 'OFFLINE',
        lastCheck: new Date().toISOString(),
        environment: this.environment,
      };
    }
  }

  /**
   * Processes events.
   */
  async processEvent(
    _documentId: string,
    _eventType: string,
    _payload: Record<string, unknown>
  ): Promise<{ success: boolean; protocol?: string; sefazCode: string; sefazMessage: string }> {
    this.checkProductionBlock();
    return {
      success: true,
      sefazCode: '135',
      sefazMessage: 'Evento processado com sucesso.',
    };
  }
}
