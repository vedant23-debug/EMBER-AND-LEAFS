"use strict";

// EMBER & LEAF — Supabase connection

const SUPABASE_URL = "https://jdnlkofqnebsoezwijfv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fEHNhN2msKj2JOVDyiq1UQ_XHwnZLmy";

if (!window.supabase) {
  console.error("Supabase library did not load.");
} else {
  window.ELSupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  console.log("EMBER & LEAF: Supabase connected.");
}