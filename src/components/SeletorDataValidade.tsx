import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, radius, spacing } from '../theme/colors';
import { formatarData } from '../lib/validadeUtils';

// Versão nativa (Android/iOS) — usa o calendário do próprio sistema
// operacional. A biblioteca por trás disso não tem versão pra navegador, por
// isso existe um arquivo separado "SeletorDataValidade.web.tsx" com a versão
// que roda na web: o Metro (empacotador do Expo) escolhe automaticamente
// qual dos dois arquivos usar de acordo com a plataforma, só pelo nome do
// arquivo — não precisa de nenhum "if" pra isso.

function dataValida(valor: string): boolean {
  const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [, ano, mes, dia] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  return d.getFullYear() === Number(ano) && d.getMonth() === Number(mes) - 1 && d.getDate() === Number(dia);
}

function textoParaData(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function dataParaTexto(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export default function SeletorDataValidade({
  valor,
  onSelecionar,
}: {
  valor: string;
  onSelecionar: (iso: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const valorValido = !!valor && dataValida(valor);

  function aoMudar(evento: DateTimePickerEvent, data?: Date) {
    if (Platform.OS === 'android') {
      setAberto(false);
    }
    if (evento.type === 'set' && data) {
      onSelecionar(dataParaTexto(data));
    }
  }

  return (
    <>
      <TouchableOpacity style={styles.input} onPress={() => setAberto(true)}>
        <Text style={valorValido ? styles.inputTexto : styles.inputPlaceholder}>
          {valorValido ? formatarData(valor) : 'Toque para escolher no calendário'}
        </Text>
      </TouchableOpacity>
      {aberto && (
        <DateTimePicker
          value={valorValido ? textoParaData(valor) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
          onChange={aoMudar}
        />
      )}
      {Platform.OS === 'ios' && aberto && (
        <TouchableOpacity style={styles.btnFecharCalendario} onPress={() => setAberto(false)}>
          <Text style={styles.btnFecharCalendarioTexto}>Concluído</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.gray900,
    justifyContent: 'center',
    minHeight: 40,
  },
  inputTexto: { fontSize: 13, color: colors.gray900 },
  inputPlaceholder: { fontSize: 13, color: colors.gray400 },
  btnFecharCalendario: { alignSelf: 'flex-end', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  btnFecharCalendarioTexto: { color: colors.navy700, fontSize: 13, fontWeight: '700' },
});
