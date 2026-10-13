import * as Location from 'expo-location';

// Localização "à prova de celular": usada na Visita Técnica e no Checklist
// de Setor. Nunca trava a tela e nunca deixa um erro escapar — sem
// permissão, GPS desligado ou sinal ruim, devolve null e o app segue.
//
// Ordem: confere a permissão (só pede se ainda dá pra pedir), confere se o
// GPS está ligado, usa a última posição conhecida se for recente e só
// então pede uma posição nova (com limite de tempo). O endereço legível
// também tem limite de tempo e é opcional.

export interface PosicaoSegura {
  lat: number;
  lng: number;
  endereco: string | null;
}

function comLimite<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function pegarLocalizacaoSegura(opcoes: { endereco?: boolean } = {}): Promise<PosicaoSegura | null> {
  try {
    let permissao = await comLimite(Location.getForegroundPermissionsAsync(), 5000);
    if (!permissao) return null;
    if (!permissao.granted) {
      if (!permissao.canAskAgain) return null;
      permissao = await comLimite(Location.requestForegroundPermissionsAsync(), 60000);
      if (!permissao || !permissao.granted) return null;
    }

    const gpsLigado = await comLimite(Location.hasServicesEnabledAsync(), 4000);
    if (gpsLigado === false) return null;

    let pos: Location.LocationObject | null = await comLimite(
      Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 300 }),
      4000
    );
    if (!pos) {
      pos = await comLimite(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 15000);
    }
    if (!pos || !pos.coords) return null;

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    let endereco: string | null = null;
    if (opcoes.endereco !== false) {
      const lista = await comLimite(Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }), 6000);
      const r = lista && lista[0];
      if (r) endereco = [r.street, r.subregion || r.city, r.region].filter(Boolean).join(', ') || null;
    }
    return { lat, lng, endereco };
  } catch {
    return null;
  }
}
