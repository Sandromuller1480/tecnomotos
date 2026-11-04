import { createFiscalProvider, getFiscalRuntimeConfig } from './FiscalProviderFactory';
import { mapFiscalPaymentMethod } from './FiscalPaymentMapper';
import { MockFiscalProvider } from './providers/MockFiscalProvider';
import { validateNfceSale } from './validateNfceSale';
import { FiscalCompanySettings, FiscalSale } from './types';
import { FiscalResolutionError, FiscalRuleRecord, resolveFiscalItem } from '../../fiscal/rules/engine';
import { isValidGtin } from '../../products/schema';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }

  console.log(`  [OK] ${message}`);
}

async function runAllTests() {
  console.log('==================================================');
  console.log('EXECUTANDO TESTES DO MODULO FISCAL FOCUS NFE');
  console.log('==================================================\n');

  const originalProvider = process.env.FISCAL_PROVIDER;
  const originalEnvironment = process.env.FISCAL_ENVIRONMENT;
  const originalProductionEnabled = process.env.FISCAL_PRODUCTION_ENABLED;

  try {
    process.env.FISCAL_PROVIDER = 'mock';
    process.env.FISCAL_ENVIRONMENT = 'mock';
    process.env.FISCAL_PRODUCTION_ENABLED = 'false';

    const company: FiscalCompanySettings = {
      companyName: 'TECNOMOTOS',
      cnpj: '22010781000138',
      uf: 'MT',
      city: 'Tangara da Serra',
      ibgeCityCode: '5107958',
      crt: '1',
      nfceSeries: '1'
    };

    const sale: FiscalSale = {
      id: 'order-test',
      customerEmail: 'cliente@exemplo.com',
      totalAmount: 100,
      paymentMethod: 'pix',
      items: [{
        id: 'item-1',
        name: 'Produto fiscal completo',
        quantity: 1,
        unitPrice: 100,
        ncm: '87141000',
        cfop: '5102',
        csosn: '102',
        fiscalRuleId: 'rule-internal-no-st',
        fiscalRuleVersion: 1,
        origin: 0,
        unit: 'UN'
      }]
    };

    console.log('1. Validando mapeamento de pagamentos...');
    assert(mapFiscalPaymentMethod('pix') === '17', 'PIX deve ser mapeado para codigo fiscal 17');
    assert(mapFiscalPaymentMethod('cash') === '01', 'Dinheiro deve ser mapeado para codigo fiscal 01');
    assert(mapFiscalPaymentMethod('credit_card') === '03', 'Credito deve ser mapeado para codigo fiscal 03');
    assert(mapFiscalPaymentMethod('debit_card') === '04', 'Debito deve ser mapeado para codigo fiscal 04');

    console.log('\n2. Validando venda NFC-e...');
    assert(validateNfceSale(company, sale).length === 0, 'Venda fiscal completa deve passar na validacao');
    assert(
      validateNfceSale(company, { ...sale, items: [{ ...sale.items[0], ncm: '' }] }).some((message) => message.includes('NCM')),
      'Produto sem NCM deve bloquear emissao'
    );

    console.log('\n3. Validando motor de regras por item...');
    const approvedRule: FiscalRuleRecord = {
      id: 'rule-internal-no-st', name: 'Interna sem ST aprovada para teste', version: 1, status: 'approved',
      companyCrt: '1', fiscalProfileId: 'profile-no-st', operationType: 'sale', documentModel: '65',
      originScope: 'internal', destinationScope: 'internal', taxpayerIndicator: 'non_contributor',
      purchasePurpose: 'final_consumption', cfop: '5102', csosn: '102', validFrom: '2026-01-01',
      approvedBy: 'fixture-accountant', approvedAt: '2026-01-01T00:00:00.000Z', source: 'fixture de teste controlada'
    };
    const product = { id: 'p1', sku: 'TESTE-1', name: 'Produto teste', fiscalStatus: 'complete' as const, fiscalProfileId: 'profile-no-st', ncm: '87141000', origin: 0, unit: 'UN', withoutGtin: true };
    const context = { companyCrt: '1', issuerUf: 'MT', destinationUf: 'MT', destinationScope: 'internal' as const, taxpayerIndicator: 'non_contributor' as const, purchasePurpose: 'final_consumption' as const, operationType: 'sale' as const, documentModel: '65' as const, occurredAt: new Date('2026-11-04T12:00:00Z') };
    assert(resolveFiscalItem(context, product, [approvedRule]).cfop === '5102', 'Regra interna aprovada deve resolver 5102/102');

    let pendingBlocked = false;
    try { resolveFiscalItem(context, { ...product, fiscalStatus: 'pending', fiscalProfileId: null }, [approvedRule]); } catch (error) { pendingBlocked = error instanceof FiscalResolutionError && error.code === 'PRODUCT_PENDING'; }
    assert(pendingBlocked, 'Produto sem perfil aprovado deve permanecer pendente e bloquear emissão');

    let conflictBlocked = false;
    try { resolveFiscalItem(context, product, [approvedRule, { ...approvedRule, id: 'rule-conflict', name: 'Conflito' }]); } catch (error) { conflictBlocked = error instanceof FiscalResolutionError && error.code === 'CONFLICTING_RULES'; }
    assert(conflictBlocked, 'Duas regras aprovadas devem bloquear por conflito');

    let expiredBlocked = false;
    try { resolveFiscalItem(context, product, [{ ...approvedRule, validTo: '2026-01-31' }]); } catch (error) { expiredBlocked = error instanceof FiscalResolutionError && error.code === 'NO_RULE'; }
    assert(expiredBlocked, 'Regra vencida não deve ser aplicada');

    let interstateNonContributorBlocked = false;
    try { resolveFiscalItem({ ...context, destinationUf: 'GO', destinationScope: 'interstate', documentModel: '55' }, product, [approvedRule]); } catch (error) { interstateNonContributorBlocked = error instanceof FiscalResolutionError && error.code === 'NO_RULE'; }
    assert(interstateNonContributorBlocked, 'Não contribuinte interestadual não deve cair silenciosamente em 6102');
    assert(isValidGtin('7898357417892'), 'GTIN-13 válido deve passar no dígito verificador');
    assert(!isValidGtin('7898357417893'), 'GTIN com dígito verificador inválido deve falhar');

    console.log('\n4. Validando provider mock...');
    const mockProvider = new MockFiscalProvider();
    const result = await mockProvider.issueNfce({
      operationId: '12345678-1234-1234-1234-123456789012',
      reference: 'tecnomotos-nfce-order-test',
      environment: 'mock',
      company,
      sale
    });
    assert(result.status === 'authorized', 'MockFiscalProvider deve autorizar sem chamada externa');
    assert(String(result.accessKey).startsWith('MOCK-NFCE-'), 'Mock nao deve gerar chave fiscal real');

    console.log('\n5. Validando factory e bloqueio de producao...');
    const config = getFiscalRuntimeConfig();
    assert(config.provider === 'mock', 'FISCAL_PROVIDER deve permanecer mock por padrao de teste');
    assert(createFiscalProvider().name === 'mock', 'Factory deve criar MockFiscalProvider em modo mock');

    process.env.FISCAL_PROVIDER = 'focusnfe';
    process.env.FISCAL_ENVIRONMENT = 'production';
    process.env.FISCAL_PRODUCTION_ENABLED = 'false';

    let blockedProduction = false;
    try {
      getFiscalRuntimeConfig();
    } catch (error) {
      blockedProduction = error instanceof Error && error.message.includes('Producao fiscal bloqueada');
    }
    assert(blockedProduction, 'Producao Focus deve exigir FISCAL_PRODUCTION_ENABLED=true');

    console.log('\n==================================================');
    console.log('TESTES FISCAIS PASSARAM COM SUCESSO');
    console.log('==================================================');
  } finally {
    process.env.FISCAL_PROVIDER = originalProvider;
    process.env.FISCAL_ENVIRONMENT = originalEnvironment;
    process.env.FISCAL_PRODUCTION_ENABLED = originalProductionEnabled;
  }
}

runAllTests().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Erro desconhecido nos testes fiscais');
  process.exit(1);
});
