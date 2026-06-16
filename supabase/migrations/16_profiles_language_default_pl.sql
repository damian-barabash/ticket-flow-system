-- Migration 16 (2026-06-16) — default UI language for NEW profiles → Polish.
-- Existing rows keep their stored value; self-registration also writes the chosen language.
alter table public.profiles alter column language set default 'pl';
