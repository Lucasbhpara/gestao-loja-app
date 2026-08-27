import { colors } from '../theme/colors';

// Funções pequenas e compartilhadas entre a tela de Validade e o resumo
// "Produtos vencendo" da Home do Administrador — pra não duplicar a mesma
// lógica de data em dois arquivos diferentes.

export function diasRestantes(dataValidadeIso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [ano, mes, dia] = dataValidadeIso.split('-').map(Number);
  const alvo = new Date(ano, mes - 1, dia);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

// Sempre exibida no formato dd/mm/aaaa.
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function statusPrazo(dias: number): { texto: string; cor: string; fundo: string } {
  if (dias < 0) return { texto: `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`, cor: colors.red500, fundo: '#FBDEDC' };
  if (dias === 0) return { texto: 'Vence hoje', cor: colors.red500, fundo: '#FBDEDC' };
  if (dias <= 3) return { texto: `Vence em ${dias} dia${dias === 1 ? '' : 's'}`, cor: colors.red500, fundo: '#FBDEDC' };
  if (dias <= 7) return { texto: `Vence em ${dias} dias`, cor: '#B4650E', fundo: '#FBEBD4' };
  return { texto: `Vence em ${dias} dias`, cor: colors.green500, fundo: '#DFF3E9' };
}
