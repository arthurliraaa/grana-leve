// Projeto Supabase (Fase 2). A chave anon é pública por natureza: sozinha ela não lê os dados de
// ninguém, quem protege tudo são as regras do banco (Row Level Security em supabase/migrations).
// A chave service_role NUNCA vai para este arquivo.
export var SUPABASE_URL = 'https://aapixkwfdktevqpopmnv.supabase.co';
export var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhcGl4a3dmZGt0ZXZxcG9wbW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1MzA5NTcsImV4cCI6MjEwNzEwNjk1N30.FVJgNMnuj1EYKbUOTsBo4GxEVwqy-UHMskwQ2ivCnVw';
// Para desenvolver e testar sem servidor: localStorage.setItem('granaleve_backend', 'local').
export var BACKEND_OVERRIDE_KEY = 'granaleve_backend';
