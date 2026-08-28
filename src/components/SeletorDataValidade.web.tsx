import React from 'react';
import { colors, radius, spacing } from '../theme/colors';

// Versão web — em navegador a gente usa o campo de data que já vem pronto
// (o "input type=date"), que abre o calendário do próprio sistema/navegador
// (Chrome, Safari, Edge etc.) sem precisar de nenhuma biblioteca extra. Esse
// arquivo só é usado na versão web; no app instalado quem entra em ação é o
// "SeletorDataValidade.tsx" (a versão com o calendário nativo do celular).
export default function SeletorDataValidade({
  valor,
  onSelecionar,
}: {
  valor: string;
  onSelecionar: (iso: string) => void;
}) {
  return (
    <input
      type="date"
      value={valor || ''}
      onChange={(evento) => onSelecionar(evento.target.value)}
      style={estiloInput}
    />
  );
}

const estiloInput: React.CSSProperties = {
  backgroundColor: colors.gray50,
  borderRadius: radius.md,
  paddingLeft: spacing.md,
  paddingRight: spacing.md,
  paddingTop: 10,
  paddingBottom: 10,
  fontSize: 13,
  color: colors.gray900,
  minHeight: 40,
  border: 'none',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
