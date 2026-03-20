import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bhfdfwpaivfupcqhwjij.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_v2M-z6RLIKjgOVOnJFeavg_ekNkzxVa";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
