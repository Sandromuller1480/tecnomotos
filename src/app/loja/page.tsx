import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flame, ShoppingBag, Compass, Wrench, Shield } from 'lucide-react';

export default function PublicStorePage() {
  return (
    <div className="flex flex-col min-h-screen bg-brand-black text-white">
      <Navbar isAuthenticated={false} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12 text-left">
        {/* Hero Section */}
        <div className="telemetry-grid p-8 rounded-lg border border-brand-grey/15 bg-brand-card flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-brand-red font-bold">
              LOJA VIRTUAL DE ALTO PADRÃO
            </span>
            <h1 className="text-3xl font-black italic uppercase tracking-tight text-white mt-1">
              Peças de Alto Desempenho
            </h1>
            <p className="text-sm text-brand-grey max-w-xl leading-relaxed">
              Equipe sua motocicleta com os melhores escapamentos, pastilhas, amortecedores e pneus de competição. Segurança, potência e entrega expressa.
            </p>
            <div className="flex gap-4 pt-2">
              <Button variant="primary" size="lg" href="/produtos">
                Explorar Catálogo
              </Button>
              <Button variant="secondary" size="lg" href="/carrinho">
                Ver Meu Carrinho
              </Button>
            </div>
          </div>
          <div className="relative w-40 h-40 bg-brand-red/5 text-brand-red border border-brand-red/10 flex items-center justify-center rounded-full flex-shrink-0 animate-pulse">
            <ShoppingBag className="w-16 h-16" />
          </div>
        </div>

        {/* Categories Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card hoverEffect className="space-y-3" withStripe>
            <Flame className="w-8 h-8 text-brand-red" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Escapamentos</h3>
            <p className="text-xs text-brand-grey leading-relaxed">Akrapovič, Yoshimura e sistemas completos de escapamento de competição.</p>
          </Card>

          <Card hoverEffect className="space-y-3" withStripe>
            <Shield className="w-8 h-8 text-brand-red" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Freios e Segurança</h3>
            <p className="text-xs text-brand-grey leading-relaxed">Pastilhas sinterizadas Brembo e fluidos de alto ponto de ebulição.</p>
          </Card>

          <Card hoverEffect className="space-y-3" withStripe>
            <Compass className="w-8 h-8 text-brand-red" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Suspensões PRO</h3>
            <p className="text-xs text-brand-grey leading-relaxed">Amortecedores e cartuchos reguláveis Öhlins calibrados sob medida.</p>
          </Card>

          <Card hoverEffect className="space-y-3" withStripe>
            <Wrench className="w-8 h-8 text-brand-red" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Pneus Racing</h3>
            <p className="text-xs text-brand-grey leading-relaxed">Pneus slicks e radiais Pirelli Supercorsa para pista e rua.</p>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
