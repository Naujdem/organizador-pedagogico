/* Claves PÚBLICAS de Supabase (la seguridad la dan las políticas RLS).
   NUNCA pongas aquí la service_role key. */
export const SUPABASE_URL = 'https://srtwmwkpdgvbaodulydj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNydHdtd2twZGd2YmFvZHVseWRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0OTgwMTcsImV4cCI6MjEwNzA3NDAxN30.Rpf0LCpAhyeBoYpifW-7Q7pVbzZnxqhnAAnfcmgtWtM';

/* Cliente OAuth de Google (público). Es el mismo de SimulaPro: así Drive se conecta una vez
   y la función «drive-token» de tu Supabase guarda el permiso permanente. */
export const GOOGLE_CLIENT_ID = '1051206554875-tmlvl2prc4vhppl81vkrs3pd3ikoieuv.apps.googleusercontent.com';
