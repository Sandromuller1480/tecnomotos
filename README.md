# TECNOMOTOS - Plataforma SaaS & E-commerce (Fundação)

Esta é a fundação completa, profissional e segura da plataforma **TECNOMOTOS**, projetada para alta performance com Next.js, Tailwind CSS, TypeScript e integração robusta com o Supabase.

A estrutura do projeto está preparada para receber módulos comerciais futuros, como loja online, ordens de serviço de oficina mecânica, controle financeiro, controle de estoque, integração com Stripe e emissão de notas fiscais NF-e.

---

## 🚀 Tecnologias e Stack Utilizada

* **Frontend**: Next.js 16 (App Router, Server & Client Components)
* **Estilização**: Tailwind CSS v4 (Identidade visual inspirada em MotoGP/Superbikes: preto profundo, grafite, prata metálico e vermelho racing)
* **Linguagem**: TypeScript (Tipagem estática estrita)
* **Validação**: Zod (Validação rígida de schemas de input)
* **Banco de Dados**: Supabase PostgreSQL
* **Autenticação**: Supabase Auth (Sessões seguras via cookies no Middleware)
* **Segurança e Autorização**: Row Level Security (RLS) e Role-Based Access Control (RBAC) granular

---

## 📂 Arquitetura de Pastas

```text
src/
├── app/                           # Rotas e páginas (App Router)
│   ├── (admin)/                   # Painel administrativo (/admin/*)
│   ├── (cliente)/                 # Área exclusiva do cliente (/cliente/*)
│   ├── api/                       # Rotas de API e Webhooks (Bootstrap e Stripe Webhook)
│   ├── layout.tsx                 # Root layout com configuração do Geist Font e tema escuro
│   └── providers.tsx              # Contextos globais (Toast, etc.)
├── components/                    # Componentes React
│   ├── ui/                        # Design System (Button, Card, Badge, Modal, Input, etc.)
│   └── layout/                    # Componentes estruturais (Sidebar, Topbar, Navbar, Footer)
├── lib/                           # Serviços de lógica e negócios
│   ├── supabase/                  # Instanciação dos clientes Supabase (Client, Server, Admin)
│   ├── permissions/               # Validadores de RBAC no servidor
│   ├── services/                  # Mocks de Stripe e NF-e
│   └── utils/                     # Utilitários (como "cn" para Tailwind classes merge)
supabase/
├── migrations/                    # Scripts organizados e versionados de migração SQL
└── seed/                          # Scripts de seed para carregar roles, permissões e configurações
docs/                              # Documentação aprofundada da fundação
```

---

## 🛠️ Configuração Inicial e Conexão com o Supabase

### 1. Criar Projeto no Supabase
1. Acesse o [Console do Supabase](https://supabase.com/) e crie um novo projeto.
2. Acesse o **SQL Editor** do projeto.

### 2. Rodar as Migrations SQL e Seed
Execute os scripts contidos em `supabase/migrations/` na ordem sequencial no SQL Editor do Supabase para criar as tabelas, funções auxiliares de segurança, triggers e políticas RLS:
1. `001_initial_schema.sql` (Perfis de usuários, funcionários e clientes)
2. `002_roles_permissions.sql` (Definição de roles e permissões)
3. `003_rbac_helpers.sql` (Funções seguras com SECURITY DEFINER e Triggers)
4. `004_rls_policies.sql` (Políticas de Row Level Security)
5. `005_audit_logs.sql` (Logs de auditoria do sistema e NF-e)
6. `006_settings.sql` (Configurações dinâmicas do banco)
7. `007_user_role_trigger.sql` (Sincronização de Roles para o JWT de Sessão)

Depois, execute o conteúdo do arquivo `supabase/seed/seed.sql` para carregar as roles (`OWNER`, `EMPLOYEE`, `CUSTOMER`), a lista de permissões e as configurações iniciais de settings.

### 3. Configurar Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env.local` e preencha as variáveis de acesso ao Supabase obtidas em **Settings > API**:
```bash
cp .env.example .env.local
```

Preencha os seguintes campos no seu `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# Credenciais temporárias para o primeiro OWNER
OWNER_EMAIL=proprietario@tecnomotos.com.br
OWNER_PASSWORD=uma-senha-segura-e-forte
```

---

## 🔐 Bootstrap Seguro do Proprietário (OWNER)

A criação do primeiro usuário administrador é feita de forma segura sem expor senhas no repositório:
1. Garanta que as variáveis `OWNER_EMAIL` e `OWNER_PASSWORD` estão preenchidas no seu `.env.local`.
2. Certifique-se de que a aplicação está rodando localmente (`npm run dev`).
3. Envie uma requisição `POST` para a rota `/api/auth/bootstrap` utilizando uma ferramenta como Postman, cURL ou o navegador:
   ```bash
   curl -X POST http://localhost:3000/api/auth/bootstrap
   ```
4. O script criará a conta de autenticação no Supabase, associará a ela a role `OWNER` e removerá quaisquer dependências de cliente.
5. **Importante**: Por segurança, uma vez criado, apague as chaves `OWNER_EMAIL` e `OWNER_PASSWORD` do seu arquivo de ambiente local. O proprietário poderá alterar sua senha a qualquer momento através do sistema.

---

## 💻 Executando Localmente

Para rodar o projeto em ambiente de desenvolvimento local, execute:

```bash
# 1. Instalar as dependências do projeto
npm install

# 2. Iniciar servidor local
npm run dev
```

Acesse o endereço [http://localhost:3000](http://localhost:3000) no seu navegador para testar a landing page pública, área do cliente e painel administrativo.

---

## ⚙️ Stripe Test & NF-e (Configuração e Testes)

* **Stripe**: Configurado para funcionar inicialmente em modo de teste (`STRIPE_MODE=test`).
* **Módulo Fiscal (NF-e MT)**: O sistema de emissão fiscal usa provider `mock` ou `focusnfe`. O padrão seguro é `FISCAL_PROVIDER=mock`, `FISCAL_ENVIRONMENT=mock` e `FISCAL_PRODUCTION_ENABLED=false`. Veja `docs/FISCAL_FOCUS_NFE.md`.

### Variáveis de Ambiente Fiscal (.env ou Vercel)
Adicione as seguintes chaves no seu arquivo de ambiente local ou nas variáveis de deploy da Vercel (Secrets do Servidor):
```env
FISCAL_ENVIRONMENT=mock
FISCAL_PROVIDER=mock
FISCAL_PRODUCTION_ENABLED=false
FISCAL_UF=MT
FISCAL_MODEL=55
FISCAL_CNPJ=00.000.000/0001-00
FISCAL_IE=123456789
FISCAL_CRT=1
FISCAL_CERTIFICATE_BASE64=string_base64_do_certificado_A1
FISCAL_CERTIFICATE_PASSWORD=senha_do_certificado_A1
FISCAL_NFE_SERIES=1
FOCUS_NFE_HOMOLOGATION_TOKEN=
FOCUS_NFE_PRODUCTION_TOKEN=
```

### Como Executar os Testes Unitários Fiscais
Para validar todas as estruturas e regras tributárias (NCM, CFOP, CRT, CSOSN/CST, geração de chave de acesso com módulo 11 e links de QR Code):
```bash
npm run test:fiscal
```

### Como Testar a Emissão Simulada (Mock)
1. Faça login como **OWNER** no painel administrativo (`admin@tecnomotos.com.br`).
2. Acesse a rota `/admin/fiscal` (NF-e).
3. Na seção de pedidos pagos pendentes, clique em **Emitir NF-e** em um pedido real.
4. O sistema gerará a estrutura XML em tempo real, validará as regras e registrará a nota autorizada em `fiscal_documents` e `fiscal_events`.
5. Você poderá ver os links para baixar o **XML** e visualizar o **DANFE (PDF)** simulados.
6. Acesse a sub-rota `/admin/fiscal/configuracoes` para gerenciar os dados da empresa, limites numéricos, trocar de ambiente e rodar o botão **Testar Conexão com SEFAZ**.

---

## 🌐 Publicando na Vercel

O projeto está totalmente preparado para deploy na Vercel:
1. Importe o repositório no painel da Vercel.
2. Em **Environment Variables**, configure as variáveis do banco Supabase, Stripe e chaves fiscais (`FISCAL_ENVIRONMENT=mock`).
3. O build de produção será executado com testes de lint e typecheck.
4. Faça a requisição `POST` em `/api/auth/bootstrap` para ativar o primeiro proprietário.
