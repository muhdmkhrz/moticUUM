/* MOTIC Supabase browser configuration.
   The publishable key is safe to use in frontend code. Never place a
   service_role or secret key in this file. */

const MOTIC_SUPABASE_URL = "https://poeodkkjuuoybhylipmg.supabase.co";
const MOTIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_yUXCryTfNVhIkGKI5UUOcA_5BrLSCrz";

if (!window.supabase?.createClient) {
  console.error("Supabase could not be loaded. Check the CDN script in the page.");
} else {
  window.moticSupabase = window.supabase.createClient(
    MOTIC_SUPABASE_URL,
    MOTIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
}