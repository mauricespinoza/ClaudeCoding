# Gestor Académico

App personal de tareas y proyectos para investigación académica. React + Vite + Tailwind.

- `npm run dev` — desarrollo local.
- `npm run build` — build normal.
- `npm run build:standalone` — genera `dist-standalone/index.html`, un único archivo que se abre con doble clic sin servidor.

## Sincronización multi-dispositivo (opcional)

Sin cuenta, los datos viven solo en el dispositivo (localStorage / `window.storage`). Para usar la app desde celular y desktop con los mismos datos:

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. En el **SQL Editor** de Supabase ejecuta una sola vez:

   ```sql
   create table kv_store (
     user_id uuid not null default auth.uid(),
     key text not null,
     value jsonb,
     updated_at timestamptz not null default now(),
     primary key (user_id, key)
   );
   alter table kv_store enable row level security;
   create policy "own rows" on kv_store
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```

3. En la app, botón **Cuenta** → pega la URL del proyecto y la **anon key** (Settings → API). Esto se hace una vez por dispositivo.
4. Crea tu cuenta (correo + contraseña) e inicia sesión. En el primer login desde el dispositivo con datos, la app ofrece subirlos a la nube.

Notas: la anon key es pública por diseño; los datos los protege Row Level Security por usuario. Conflictos entre dispositivos se resuelven por última escritura (se recomienda editar desde una sesión a la vez). Para que la app sea accesible desde el celular necesitas servirla desde una URL (por ejemplo, deploy del build en Netlify/Vercel/GitHub Pages, todos con capa gratuita) — el HTML standalone también funciona si te lo copias al teléfono, pero una URL es más cómoda.

## IA (sugerencias de actividades y análisis de bitácora)

Tres proveedores, configurables desde el engranaje junto a "Sugerir con IA" en un proyecto:

- **Google Gemini** (default): gratis con key propia — créala en [aistudio.google.com/apikey](https://aistudio.google.com/apikey) y pégala en el engranaje. La key queda en tu storage personal; no compartas tu respaldo JSON con la key adentro.
- **Ollama local**: gratis y privado; requiere [Ollama](https://ollama.com) corriendo con un modelo descargado (`ollama pull llama3.1`).
- **Claude**: requiere API key de Anthropic (`VITE_ANTHROPIC_API_KEY` en desarrollo).
