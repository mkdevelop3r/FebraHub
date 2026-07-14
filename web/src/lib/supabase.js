import { createClient } from "@supabase/supabase-js";

// A anon key e PUBLICA por design. Nao ha segredo aqui.
// Quem protege o dado e a RLS no Postgres — nao esta chave,
// nao o React, nao o bundle. Ver migration 05.
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    "Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. " +
      "No Netlify: Site settings > Environment variables."
  );
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});
