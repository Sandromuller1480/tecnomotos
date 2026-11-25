import crypto from 'crypto';

export class QrCodePayloadBuilder {
  /**
   * Generates the URL parameter payload for the NFC-e QR Code.
   * Based on the official SEFAZ Manual de Orientação do Contribuinte (version 2.00 QR Code).
   * Format: chNFe=...&versao=2&tpAmb=...&cIdToken=...&cHashQRCode=...
   */
  buildPayload(params: {
    chNFe: string;
    tpAmb: '1' | '2'; // 1: Produção, 2: Homologação
    vNF: number;
    dhEmi: string;
    customerDocument?: string;
    cscId: string;
    csc: string;
  }): string {
    const queryUrl = params.tpAmb === '1'
      ? 'https://www.sefaz.mt.gov.br/nfce/consultanfce'
      : 'https://homologacao.sefaz.mt.gov.br/nfce/consultanfce';

    const dateHex = Buffer.from(params.dhEmi).toString('hex');
    const totalVal = params.vNF.toFixed(2);
    
    // Concatenated string for SHA-1 hash calculation
    // format: chNFe + versao + tpAmb + [cDest] + dhEmi + vNF + vICMS + digVal + cIdToken + CSC
    const rawConcat = `${params.chNFe}2${params.tpAmb}${params.customerDocument ? params.customerDocument.replace(/\D/g, '') : ''}${dateHex}${totalVal}${params.cscId}${params.csc}`;
    
    // Calculate Sefaz compliant SHA-1 hash code
    const cHashQRCode = crypto
      .createHash('sha1')
      .update(rawConcat)
      .digest('hex')
      .toUpperCase();

    const destQuery = params.customerDocument ? `&cDest=${params.customerDocument.replace(/\D/g, '')}` : '';
    return `${queryUrl}?chNFe=${params.chNFe}&versao=2&tpAmb=${params.tpAmb}${destQuery}&dhEmi=${dateHex}&vNF=${totalVal}&cIdToken=${params.cscId}&cHashQRCode=${cHashQRCode}`;
  }
}

export class QrCodeRenderer {
  /**
   * Renders the QR Code payload URL into a Base64 encoded PNG image for the DANFE.
   */
  async renderToDataUrl(payload: string): Promise<string> {
    console.log(`[QrCodeRenderer] Rendering QR Code URL to image: ${payload}`);
    // In production, we would use a library like 'qrcode' to render the payload.
    // For this foundation, we return a mock base64 transparent 1x1 image.
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  }
}

export class QrCodeService {
  private builder = new QrCodePayloadBuilder();
  private renderer = new QrCodeRenderer();

  async generateQrCode(params: {
    chNFe: string;
    tpAmb: '1' | '2';
    vNF: number;
    dhEmi: string;
    customerDocument?: string;
    cscId: string;
    csc: string;
  }): Promise<string> {
    const payload = this.builder.buildPayload(params);
    return this.renderer.renderToDataUrl(payload);
  }
}
