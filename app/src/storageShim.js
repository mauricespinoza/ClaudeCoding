// Dev-only polyfill for the `window.storage` key-value API the real artifact
// host provides. Backs onto localStorage so `npm run dev` works standalone.
// Not part of the app's architecture — the app never assumes this shim exists.
if (typeof window !== 'undefined' && !window.storage) {
  const prefix = 'kv:'

  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(prefix + key)
      return raw == null ? null : JSON.parse(raw)
    },
    async set(key, value) {
      localStorage.setItem(prefix + key, JSON.stringify(value))
      return true
    },
    async delete(key) {
      localStorage.removeItem(prefix + key)
      return true
    },
    async list(keyPrefix = '') {
      const keys = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(prefix + keyPrefix)) keys.push(k.slice(prefix.length))
      }
      return keys
    },
  }
}
