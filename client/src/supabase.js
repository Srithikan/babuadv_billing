import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bfjkgfhvlvqeylvhjqce.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmamtnZmh2bHZxZXlsdmhqcWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjUzMDMsImV4cCI6MjEwMjEwMTMwM30.I7_yft17dq9JzUaxCx3nP1rMuv1icghB2u1qs4Z6eF8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
