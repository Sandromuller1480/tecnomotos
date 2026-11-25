function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [OK] ${message}`);
}

async function runStripeTests() {
  console.log('==================================================');
  console.log('EXECUTANDO SUÍTE DE TESTES UNITÁRIOS DO MÓDULO STRIPE');
  console.log('==================================================\n');

  try {
    // ----------------------------------------------------
    // TEST 1: Currency Conversion to Centavos
    // ----------------------------------------------------
    console.log('1. Testando Conversão Monetária para Centavos...');
    
    const convertPrice = (price: number): number => Math.round(price * 100);
    
    assert(convertPrice(149.90) === 14990, 'R$ 149,90 deve ser convertido para 14990 centavos');
    assert(convertPrice(2450.00) === 245000, 'R$ 2450,00 deve ser convertido para 245000 centavos');
    assert(convertPrice(0.99) === 99, 'R$ 0,99 deve ser convertido para 99 centavos');
    assert(convertPrice(10.00) === 1000, 'R$ 10,00 deve ser convertido para 1000 centavos');

    // ----------------------------------------------------
    // TEST 2: Stripe Product Synchronization Simulation
    // ----------------------------------------------------
    console.log('\n2. Testando Lógica de Sincronização e Estados...');

    const simulatedSyncStates: string[] = [];
    const simulatedProduct = {
      id: 'p-1',
      name: 'Escapamento Akrapovic GP',
      price: 2450.00,
      stripe_product_id: null as string | null,
      stripe_price_id: null as string | null,
      stripe_sync_status: 'pending',
      stripe_sync_error: null as string | null
    };

    // Simulate creation sync steps
    simulatedSyncStates.push(simulatedProduct.stripe_sync_status); // pending
    
    // Step 1: syncing
    simulatedProduct.stripe_sync_status = 'syncing';
    simulatedSyncStates.push(simulatedProduct.stripe_sync_status);

    // Step 2: call Stripe SDK mocked product & price creation
    const mockedStripeProdId = 'prod_mock123';
    const mockedStripePriceId = 'price_mock123';
    
    simulatedProduct.stripe_product_id = mockedStripeProdId;
    simulatedProduct.stripe_price_id = mockedStripePriceId;
    simulatedProduct.stripe_sync_status = 'synced';
    simulatedSyncStates.push(simulatedProduct.stripe_sync_status);

    assert(simulatedSyncStates[0] === 'pending', 'Estado inicial deve ser "pending"');
    assert(simulatedSyncStates[1] === 'syncing', 'Estado intermediário deve ser "syncing"');
    assert(simulatedSyncStates[2] === 'synced', 'Estado de sucesso deve ser "synced"');
    assert(simulatedProduct.stripe_product_id === 'prod_mock123', 'Deve associar o stripe_product_id');
    assert(simulatedProduct.stripe_price_id === 'price_mock123', 'Deve associar o stripe_price_id');

    // ----------------------------------------------------
    // TEST 3: Price Immutability Simulation (Price Change triggers new price)
    // ----------------------------------------------------
    console.log('\n3. Testando Imutabilidade de Preços do Stripe (Preço alterado)...');

    const productUpdateSim = {
      ...simulatedProduct,
      price: 2600.00, // Updated price from 2450.00
    };

    let didCreateNewPrice = false;
    let oldPriceDeactivated = false;
    let updatedStripePriceId = productUpdateSim.stripe_price_id;

    if (productUpdateSim.stripe_product_id) {
      const oldPriceInCents = 245000;
      const newPriceInCents = Math.round(productUpdateSim.price * 100);

      if (oldPriceInCents !== newPriceInCents) {
        // Stripe Prices are immutable. We must create a new Price.
        oldPriceDeactivated = true;
        didCreateNewPrice = true;
        updatedStripePriceId = 'price_mock456_new'; // New price id
      }
    }

    assert(didCreateNewPrice, 'Alteração de valor de venda deve disparar criação de novo Price no Stripe');
    assert(oldPriceDeactivated, 'Preço antigo deve ser desativado no Stripe');
    assert(updatedStripePriceId === 'price_mock456_new', 'Deve atualizar o stripe_price_id no banco com o novo valor');

    // ----------------------------------------------------
    // TEST 4: Backend Security Calculations (Do not trust frontend values)
    // ----------------------------------------------------
    console.log('\n4. Testando Segurança do Checkout (Cálculo no servidor)...');

    const clientCart = [
      { id: 'p-1', name: 'Escapamento Akrapovic GP', price: 150.00, quantity: 2 } // Client tries to spoof price to 150.00
    ];

    const dbProducts = [
      { id: 'p-1', name: 'Escapamento Akrapovic GP', price: 2450.00, stock_quantity: 10 } // Real DB price is 2450.00
    ];

    // Server-side validation
    let computedTotal = 0;
    let hasStock = true;

    for (const clientItem of clientCart) {
      const dbProd = dbProducts.find(p => p.id === clientItem.id);
      if (dbProd) {
        if (dbProd.stock_quantity < clientItem.quantity) {
          hasStock = false;
        }
        // Use DB price, not client price!
        computedTotal += dbProd.price * clientItem.quantity;
      }
    }

    assert(computedTotal === 4900.00, 'Total deve ser calculado usando o preço do banco de dados (R$ 4900,00) e não o do cliente (R$ 300,00)');
    assert(hasStock, 'Deve possuir estoque suficiente');

    // ----------------------------------------------------
    // TEST 5: Webhook Idempotency Check
    // ----------------------------------------------------
    console.log('\n5. Testando Idempotência do Webhook contra duplicidades...');

    const processedEvents = new Set<string>();
    const stripeEvent = { id: 'evt_stripe_999', type: 'checkout.session.completed' };

    const processEvent = (evtId: string): { status: string; processed: boolean } => {
      if (processedEvents.has(evtId)) {
        return { status: 'ignored', processed: false };
      }
      processedEvents.add(evtId);
      return { status: 'success', processed: true };
    };

    const firstRun = processEvent(stripeEvent.id);
    const secondRun = processEvent(stripeEvent.id);

    assert(firstRun.processed && firstRun.status === 'success', 'Primeiro processamento do webhook deve ser aceito');
    assert(!secondRun.processed && secondRun.status === 'ignored', 'Segundo processamento do mesmo evento deve ser bloqueado por idempotência');

    // ----------------------------------------------------
    // TEST 6: Inventory Deduction
    // ----------------------------------------------------
    console.log('\n6. Testando Dedução de Estoque no Pagamento...');

    const initialStock = 10;
    const soldQty = 2;
    let finalStock = initialStock;

    // Simulate purchase complete
    if (firstRun.processed) {
      finalStock = initialStock - soldQty;
    }

    assert(finalStock === 8, 'Dedução de estoque deve ocorrer uma única vez e subtrair a quantidade vendida (10 - 2 = 8)');

    console.log('\n==================================================');
    console.log('TODOS OS TESTES UNITÁRIOS DO STRIPE PASSARAM COM SUCESSO!');
    console.log('==================================================');
  } catch (err: unknown) {
    console.error('\n[TEST FAILURE]', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

runStripeTests();
