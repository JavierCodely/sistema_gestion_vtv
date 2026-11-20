import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Generá .env.local con `npm run env:local`.",
  );
}

export const supabaseUrl = url;
export const supabaseAnonKey = anonKey;

export const supabase = createClient<Database>(url, anonKey);
