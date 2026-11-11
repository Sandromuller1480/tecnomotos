-- Seed Roles
INSERT INTO public.roles (name, description) VALUES
('OWNER', 'Proprietário administrador com acesso total ao sistema.'),
('EMPLOYEE', 'Funcionário operacional com permissões granulares.'),
('CUSTOMER', 'Cliente da loja online com acesso exclusivo à área do cliente.')
ON CONFLICT (name) DO NOTHING;

-- Seed Permissions
INSERT INTO public.permissions (key, description) VALUES
('dashboard.view', 'Visualizar o dashboard administrativo geral.'),

('products.view', 'Visualizar produtos no catálogo.'),
('products.create', 'Cadastrar novos produtos no catálogo.'),
('products.update', 'Editar informações cadastrais dos produtos.'),
('products.delete', 'Remover produtos do catálogo.'),
('products.price.update', 'Atualizar preços de venda e de custo dos produtos.'),

('inventory.view', 'Visualizar o estoque e movimentações.'),
('inventory.update', 'Registrar entradas, saídas e ajustes de estoque.'),

('customers.view', 'Visualizar perfis e detalhes dos clientes.'),
('customers.update', 'Editar cadastros de clientes, endereços e veículos.'),

('orders.view', 'Visualizar pedidos de vendas.'),
('orders.update', 'Atualizar status e informações de pedidos.'),

('crm.view', 'Acessar módulo de CRM e interações com clientes.'),

('financial.view', 'Visualizar fluxo de caixa, contas a pagar e a receber.'),
('financial.create', 'Registrar transações financeiras.'),
('financial.update', 'Editar lançamentos financeiros.'),

('service_orders.view', 'Visualizar ordens de serviço da oficina.'),
('service_orders.create', 'Abrir novas ordens de serviço.'),
('service_orders.update', 'Atualizar andamento, peças e serviços de ordens de serviço.'),

('reports.view', 'Visualizar relatórios administrativos e estatísticas.'),

('fiscal.view', 'Visualizar notas fiscais emitidas (NF-e).'),
('fiscal.create', 'Emitir ou cancelar notas fiscais.'),

('employees.view', 'Visualizar lista e detalhes de funcionários.'),
('employees.create', 'Cadastrar novos funcionários.'),
('employees.update', 'Atualizar dados e permissões de funcionários.'),
('employees.delete', 'Bloquear ou remover funcionários.'),

('settings.view', 'Visualizar configurações do sistema.'),
('settings.update', 'Alterar configurações globais da plataforma.'),

('discounts.view', 'Visualizar cupons e campanhas de descontos.'),
('discounts.create', 'Criar novas regras ou cupons de desconto.'),
('discounts.update', 'Editar cupons e regras de desconto.'),
('discounts.delete', 'Remover ou inativar cupons de desconto.')
ON CONFLICT (key) DO NOTHING;

-- Assign Default Permissions to EMPLOYEE role
-- (Employees have restricted access: e.g. view dashboard, manage products & inventory, view customers and orders)
DO $$
DECLARE
    role_emp_id UUID;
    perm_id UUID;
    perm_keys TEXT[] := ARRAY[
        'dashboard.view',
        'products.view',
        'products.create',
        'products.update',
        'inventory.view',
        'inventory.update',
        'customers.view',
        'customers.update',
        'orders.view',
        'orders.update',
        'crm.view',
        'service_orders.view',
        'service_orders.create',
        'service_orders.update'
    ];
    pkey TEXT;
BEGIN
    SELECT id INTO role_emp_id FROM public.roles WHERE name = 'EMPLOYEE';
    
    IF role_emp_id IS NOT NULL THEN
        FOREACH pkey IN ARRAY perm_keys LOOP
            SELECT id INTO perm_id FROM public.permissions WHERE key = pkey;
            IF perm_id IS NOT NULL THEN
                INSERT INTO public.role_permissions (role_id, permission_id)
                VALUES (role_emp_id, perm_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;
END $$;

-- Seed Default Settings
INSERT INTO public.settings (key, value, description) VALUES
('company_name', '"TECNOMOTOS"', 'Nome oficial da empresa.'),
('stripe_mode', '"test"', 'Modo de operação do Stripe (test ou production).'),
('fiscal_environment', '"mock"', 'Ambiente de emissão fiscal de NF-e (mock ou production).')
ON CONFLICT (key) DO NOTHING;
