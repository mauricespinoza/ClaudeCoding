// Modo nube: login + sincronización multi-dispositivo vía Supabase (plan
// gratuito). El usuario crea su propio proyecto en supabase.com y pega la
// URL y la anon key UNA vez por dispositivo (quedan en localStorage, que es
// seguro para la anon key: está diseñada para ser pública; los datos los
// protege Row Level Security por usuario).
//
// Esquema requerido en Supabase (SQL Editor, una sola vez):
//
//   create table kv_store (
//     user_id uuid not null default auth.uid(),
//     key text not null,
//     value jsonb,
//     updated_at timestamptz not null default now(),
//     primary key (user_id, key)
//   );
//   alter table kv_store enable row level security;
//   create policy "own rows" on kv_store
//     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
//
// Conflictos entre dispositivos: última escritura gana (documentado en
// ARQUITECTURA.md §7 — se recomienda una sesión activa a la vez).

import { createClient } from '@supabase/supabase-js'

const CONFIG_KEY = 'cloud-config' // localStorage directo: es config del dispositivo, no dato de la app

let client = null

export function getCloudConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) ?? null
  } catch {
    return null
  }
}

export function saveCloudConfig(url, anonKey) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }))
  client = null // fuerza recrear el cliente con la nueva config
}

export function clearCloudConfig() {
  localStorage.removeItem(CONFIG_KEY)
  client = null
}

export function getClient() {
  if (client) return client
  const config = getCloudConfig()
  if (!config?.url || !config?.anonKey) return null
  client = createClient(config.url, config.anonKey)
  return client
}

export async function getSession() {
  const c = getClient()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session ?? null
}

export async function signUp(email, password) {
  const c = getClient()
  if (!c) throw new Error('Configura primero la URL y anon key de Supabase.')
  const { data, error } = await c.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function signIn(email, password) {
  const c = getClient()
  if (!c) throw new Error('Configura primero la URL y anon key de Supabase.')
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function signOut() {
  const c = getClient()
  if (c) await c.auth.signOut()
}

// Backend clave/valor sobre la tabla kv_store, con la misma interfaz que el
// backend local (get/set) para poder enchufarlo en storage.js.
export function createCloudBackend() {
  return {
    async get(key) {
      const c = getClient()
      const { data, error } = await c.from('kv_store').select('value').eq('key', key).maybeSingle()
      if (error) throw new Error(`Error leyendo de la nube: ${error.message}`)
      return data?.value ?? null
    },
    async set(key, value) {
      const c = getClient()
      const {
        data: { user },
      } = await c.auth.getUser()
      if (!user) throw new Error('Sesión expirada: vuelve a iniciar sesión.')
      const { error } = await c
        .from('kv_store')
        .upsert({ user_id: user.id, key, value, updated_at: new Date().toISOString() })
      if (error) throw new Error(`Error guardando en la nube: ${error.message}`)
    },
  }
}
