import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

export function Footer() {
  return (
    <footer className="bg-brand-black border-t border-brand-grey/15 text-brand-grey text-xs py-12 shrink-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Brand details */}
        <div className="space-y-4">
          <Logo />
          <p className="font-sans leading-relaxed text-brand-grey/80 mt-2">
            Desempenho para sua moto. Peças, acessórios e soluções para quem exige o máximo.
          </p>
        </div>

        {/* Catalog Menu Links */}
        <div className="space-y-3">
          <h5 className="font-mono uppercase font-bold tracking-widest text-white text-[10px]">
            Catálogo
          </h5>
          <ul className="space-y-2 font-mono text-[11px]">
            <li>
              <Link href="/produtos?cat=escapamentos" className="hover:text-brand-red transition-colors">
                Escapamentos
              </Link>
            </li>
            <li>
              <Link href="/produtos?cat=freios" className="hover:text-brand-red transition-colors">
                Pastilhas & Freios
              </Link>
            </li>
            <li>
              <Link href="/produtos?cat=motor" className="hover:text-brand-red transition-colors">
                Peças de Motor
              </Link>
            </li>
            <li>
              <Link href="/produtos?cat=pneus" className="hover:text-brand-red transition-colors">
                Pneus de alto desempenho
              </Link>
            </li>
          </ul>
        </div>

        {/* Office Menu Links */}
        <div className="space-y-3">
          <h5 className="font-mono uppercase font-bold tracking-widest text-white text-[10px]">
            Serviços
          </h5>
          <ul className="space-y-2 font-mono text-[11px]">
            <li>
              <Link href="/oficina?serv=revisao" className="hover:text-brand-red transition-colors">
                Revisão Completa
              </Link>
            </li>
            <li>
              <Link href="/oficina?serv=freios" className="hover:text-brand-red transition-colors">
                Manutenção de Freios
              </Link>
            </li>
            <li>
              <Link href="/oficina?serv=injeção" className="hover:text-brand-red transition-colors">
                Diagnóstico Eletrônico
              </Link>
            </li>
            <li>
              <Link href="/oficina?serv=preparacao" className="hover:text-brand-red transition-colors">
                Preparação de Motores
              </Link>
            </li>
          </ul>
        </div>

        {/* Contact info */}
        <div className="space-y-3">
          <h5 className="font-mono uppercase font-bold tracking-widest text-white text-[10px]">
            Contato
          </h5>
          <ul className="space-y-2 font-sans text-brand-grey/90">
            <li>Av. da Velocidade, 1000 - Interlagos</li>
            <li>São Paulo - SP</li>
            <li className="font-mono text-white mt-2">contato@tecnomotos.com.br</li>
            <li className="font-mono text-white">(11) 99999-8888</li>
          </ul>
        </div>
      </div>

      {/* Copyright */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-brand-grey/10 mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[10px]">
        <span>&copy; {new Date().getFullYear()} TECNOMOTOS. Todos os direitos reservados.</span>
        <div className="flex gap-4">
          <Link href="/termos" className="hover:text-white transition-colors">
            Termos de Uso
          </Link>
          <Link href="/privacidade" className="hover:text-white transition-colors">
            Privacidade
          </Link>
        </div>
      </div>
    </footer>
  );
}
