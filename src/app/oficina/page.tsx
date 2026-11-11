import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wrench, Shield, Zap, Flame, Compass } from 'lucide-react';

export default function PublicOficinaPage() {
  return (
    <div className="flex flex-col min-h-screen bg-brand-black text-white">
      <Navbar isAuthenticated={false} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12 text-left">
        {/* Intro */}
        <div>
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-brand-red font-bold">
            OFICINA DE ALTO PADRÃO
          </span>
          <h1 className="text-3xl font-black italic uppercase tracking-tight text-white mt-1">
            Centro de Serviços de Alto Desempenho
          </h1>
          <p className="text-sm text-brand-grey max-w-xl mt-2 leading-relaxed">
            Equipamentos de telemetria e diagnóstico computadorizado de última geração. Cuidamos da mecânica, injeção e acerto dinâmico de pistas para a sua superbike.
          </p>
        </div>

        {/* Services Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card hoverEffect className="space-y-4" withStripe>
            <Wrench className="w-8 h-8 text-brand-red" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Revisão Periódica</h3>
            <p className="text-xs text-brand-grey leading-relaxed">
              Lista de verificação completa com mais de 50 itens de mecânica, reaperto dinâmico de chassi e troca de fluidos homologados.
            </p>
          </Card>

          <Card hoverEffect className="space-y-4" withStripe>
            <Zap className="w-8 h-8 text-brand-red" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Preparação de ECU</h3>
            <p className="text-xs text-brand-grey leading-relaxed">
              Remapeamento e calibração de mapas eletrônicos, ajustes de controle de tração, largada e respostas de aceleração.
            </p>
          </Card>

          <Card hoverEffect className="space-y-4" withStripe>
            <Compass className="w-8 h-8 text-brand-red" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Acerto de Pista</h3>
            <p className="text-xs text-brand-grey leading-relaxed">
              Geometria fina de suspensões Öhlins/Showas dianteiras e traseiras configuradas para o peso do piloto e pista.
            </p>
          </Card>

          <Card hoverEffect className="space-y-4" withStripe>
            <Shield className="w-8 h-8 text-brand-red" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Manutenção de Freios</h3>
            <p className="text-xs text-brand-grey leading-relaxed">
              Substituição de pastilhas sinterizadas, discos flutuantes e troca de fluídos de alta temperatura.
            </p>
          </Card>
        </div>

        {/* Call to action */}
        <Card className="p-8 telemetry-grid max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-2 text-left">
            <Flame className="w-8 h-8 text-brand-red" />
            <h3 className="text-lg font-black italic uppercase tracking-wider text-white">Agende o Serviço da sua Moto</h3>
            <p className="text-xs text-brand-grey max-w-md leading-relaxed">
              Acesse a área do cliente para cadastrar sua moto e acompanhar em tempo real o andamento de peças e listas de verificação da ordem de serviço.
            </p>
          </div>
          <Button variant="primary" size="lg" href="/login">
            Acessar / Agendar
          </Button>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
