import { useState } from 'react'
import { Cloud, CloudOff, Loader2, LogOut, X } from 'lucide-react'
import { clearCloudConfig, getCloudConfig, saveCloudConfig, signIn, signOut, signUp } from '../cloud.js'

const SETUP_SQL = `create table kv_store (
  user_id uuid not null default auth.uid(),
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table kv_store enable row level security;
create policy "own rows" on kv_store
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`

// Login opcional para usar la app desde varios dispositivos (celular +
// desktop) con los mismos datos. Sin sesión, la app sigue funcionando en
// modo local como siempre. El backend lo aporta el propio usuario con un
// proyecto gratuito de Supabase; ver instrucciones dentro del modal.
export function AccountControl({ session, onSignedIn, onSignedOut }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [url, setUrl] = useState(getCloudConfig()?.url ?? '')
  const [anonKey, setAnonKey] = useState(getCloudConfig()?.anonKey ?? '')
  const [showSetup, setShowSetup] = useState(!getCloudConfig())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const configured = !!getCloudConfig()

  const handleSaveConfig = () => {
    if (!url.trim() || !anonKey.trim()) return
    saveCloudConfig(url, anonKey)
    setShowSetup(false)
    setError(null)
    setInfo('Configuración guardada en este dispositivo. Ahora inicia sesión o crea tu cuenta.')
  }

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleSignIn = () =>
    run(async () => {
      const { session: s } = await signIn(email, password)
      setOpen(false)
      await onSignedIn(s)
    })

  const handleSignUp = () =>
    run(async () => {
      const { session: s } = await signUp(email, password)
      if (s) {
        setOpen(false)
        await onSignedIn(s)
      } else {
        setInfo('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.')
      }
    })

  const handleSignOut = () =>
    run(async () => {
      await signOut()
      setOpen(false)
      onSignedOut()
    })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={session ? `Sesión activa: ${session.user.email} (datos sincronizados en la nube)` : 'Iniciar sesión para sincronizar entre dispositivos'}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
          session ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
        }`}
      >
        {session ? <Cloud size={13} /> : <CloudOff size={13} />}
        {session ? session.user.email.split('@')[0] : 'Cuenta'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="mt-12 w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Cuenta y sincronización</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              {session ? (
                <>
                  <p className="text-sm text-gray-700">
                    Sesión activa como <span className="font-medium">{session.user.email}</span>. Tus datos se guardan
                    en la nube y están disponibles desde cualquier dispositivo donde inicies sesión.
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                    Cerrar sesión (vuelve al modo local)
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500">
                    La app funciona sin cuenta (datos solo en este dispositivo). Con una cuenta, tus datos se
                    sincronizan y puedes usarla desde el celular y el computador a la vez.
                  </p>

                  <button
                    type="button"
                    onClick={() => setShowSetup((s) => !s)}
                    className="text-xs text-blue-600 underline"
                  >
                    {showSetup ? 'Ocultar configuración del servidor' : configured ? 'Cambiar servidor (Supabase)' : 'Configurar servidor (primera vez)'}
                  </button>

                  {showSetup && (
                    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                      <p className="text-[11px] leading-relaxed text-gray-500">
                        1. Crea un proyecto gratuito en <span className="font-medium">supabase.com</span>.<br />
                        2. En el SQL Editor, ejecuta el script de abajo (una sola vez).<br />
                        3. Copia la <span className="font-medium">URL</span> y la <span className="font-medium">anon key</span> desde
                        Settings → API y pégalas aquí. Se guardan solo en este dispositivo.
                      </p>
                      <details className="text-[11px] text-gray-500">
                        <summary className="cursor-pointer font-medium">Ver script SQL</summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-gray-800 p-2 text-[10px] leading-snug text-gray-100">{SETUP_SQL}</pre>
                      </details>
                      <input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://xxxx.supabase.co"
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                      />
                      <input
                        value={anonKey}
                        onChange={(e) => setAnonKey(e.target.value)}
                        placeholder="anon key (pública, protegida por RLS)"
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveConfig}
                          disabled={!url.trim() || !anonKey.trim()}
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                        >
                          Guardar configuración
                        </button>
                        {configured && (
                          <button
                            type="button"
                            onClick={() => {
                              clearCloudConfig()
                              setUrl('')
                              setAnonKey('')
                            }}
                            className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                          >
                            Borrar
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {configured && (
                    <div className="space-y-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Correo"
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                      />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contraseña"
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSignIn}
                          disabled={busy || !email || !password}
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                        >
                          {busy && <Loader2 size={14} className="animate-spin" />}
                          Iniciar sesión
                        </button>
                        <button
                          type="button"
                          onClick={handleSignUp}
                          disabled={busy || !email || !password}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                        >
                          Crear cuenta
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {info && <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">{info}</p>}
              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
