import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabaseConfig';

export const supabaseConfigurado = SUPABASE_URL.trim().length > 0 && SUPABASE_ANON_KEY.trim().length > 0;

// Enquanto SUPABASE_URL/SUPABASE_ANON_KEY não forem preenchidos em
// src/config/supabaseConfig.ts, criamos o client com valores de
// placeholder só pra não quebrar o import — o AuthContext confere
// `supabaseConfigurado` antes de tentar usar de verdade.
export const supabase = createClient(
  supabaseConfigurado ? SUPABASE_URL : 'https://placeholder.supabase.co',
  supabaseConfigurado ? SUPABASE_ANON_KEY : 'placeholder-key'
);
