import React from 'react';
import { Feather } from '@expo/vector-icons';
import { colors } from './colors';

// Ícone + cores de cada setor, no mesmo padrão visual da Visita Técnica.
// Usado nos checklists (Rotina do dia e Avaliação de Setor).
export type IconeFeather = React.ComponentProps<typeof Feather>['name'];
export interface VisualSetor {
  icone: IconeFeather;
  cor: string;
  fundo: string;
}

const VISUAL: Record<string, VisualSetor> = {
  mercearia: { icone: 'shopping-cart', cor: '#1B2A6B', fundo: '#E3E7F5' },
  acougue: { icone: 'scissors', cor: '#C5392F', fundo: '#FBE4E2' },
  flv: { icone: 'sun', cor: '#2C8F5E', fundo: '#DCF2E7' },
  frios: { icone: 'thermometer', cor: '#2C6FB4', fundo: '#E1ECF8' },
  padaria: { icone: 'coffee', cor: '#B4650E', fundo: '#FBEBD4' },
  deposito: { icone: 'package', cor: '#6B4FA3', fundo: '#ECE6F7' },
  area_externa: { icone: 'map', cor: '#5B6280', fundo: '#E7E9F2' },
  gerencia: { icone: 'briefcase', cor: '#1B2A6B', fundo: '#E3E7F5' },
  cpd: { icone: 'monitor', cor: '#2C6FB4', fundo: '#E1ECF8' },
  'frente-caixa': { icone: 'credit-card', cor: '#2C8F5E', fundo: '#DCF2E7' },
  prevencao: { icone: 'shield', cor: '#C5392F', fundo: '#FBE4E2' },
  promotores: { icone: 'users', cor: '#B4650E', fundo: '#FBEBD4' },
};

export function visualDoSetor(key: string | null | undefined): VisualSetor {
  if (!key) return { icone: 'layers', cor: colors.navy700, fundo: colors.gray100 };
  return VISUAL[key] ?? { icone: 'grid', cor: colors.navy700, fundo: colors.gray100 };
}
