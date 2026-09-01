# Dashboard Content — guía de puesta en marcha

Tiempo total: unos 20 minutos. Tres bloques: (1) publicar en Netlify, (2) crear la app de Meta para conectar Instagram, (3) opcionales.

---

## 1. Publicar en Netlify (5 min)

1. Abrí el botón **Deploy to Netlify** del README (o entrá a `https://app.netlify.com/start/deploy?repository=https://github.com/danielsanchezduarte25-glitch/dashboard-content`).
2. Netlify te pide conectar GitHub y clona el repo en tu cuenta.
3. Te pide tres variables:
   - `APP_PASSWORD`: la contraseña con la que vas a entrar al panel. Inventá una larga.
   - `SUPADATA_API_KEY`: tu llave de Supadata (empieza con `sd_`).
   - `ANTHROPIC_API_KEY`: tu llave de Anthropic (empieza con `sk-ant-`). Si todavía no la tenés, poné `pendiente` y la cambiás después en *Site configuration → Environment variables*.
4. **Deploy**. En 1–2 minutos tenés una URL tipo `https://algo-123.netlify.app`.
5. (Recomendado) En *Site configuration → Site details → Change site name* ponele un nombre corto, por ejemplo `dashboard-dani` → `https://dashboard-dani.netlify.app`. **Anotá esa URL**: la vas a necesitar en el paso 2.
6. Entrá a la URL, poné tu `APP_PASSWORD` y ya estás dentro. Instagram todavía va a aparecer "sin conectar".

> Cada vez que cambies una variable de entorno en Netlify hacé **Deploys → Trigger deploy → Deploy site** para que tome efecto.

---

## 2. Crear la app de Meta y conectar Instagram (10 min)

Tu cuenta ya es **Creator**, que es lo que hace falta. Lo que sigue es registrar una "app" gratuita que le da permiso al dashboard para leer *tus* métricas (nadie más puede usarla).

1. Entrá a **https://developers.facebook.com** e iniciá sesión con tu Facebook (si no tenés, creá uno; Meta lo exige para el portal de desarrolladores, aunque no necesitás vincular ninguna página).
2. Arriba a la derecha: **My Apps → Create App**.
3. Nombre de la app: `Dashboard Content`. Email: el tuyo. En *Use cases* (casos de uso) marcá **"Instagram"** (si te pregunta el tipo de app, elegí **Business**; no hace falta vincular un portafolio comercial). **Create app**.
4. En el panel de la app, menú izquierdo: **Instagram → API setup with Instagram login** (o "Configuración de la API con inicio de sesión de Instagram").
5. Paso **"1. Generate access tokens"**: hacé clic en **Add account** y agregá tu cuenta `@soydanielsanchez_` (te va a pedir loguearte en Instagram). Esto te registra como *tester* de tu propia app.
6. Paso **"3. Set up Instagram business login"** → **Business login settings**:
   - En **OAuth redirect URIs** pegá exactamente:
     ```
     https://TU-SITIO.netlify.app/api/ig/callback
     ```
     (reemplazá `TU-SITIO` por el nombre real de tu sitio, sin barra final).
   - **Deauthorize callback URL** y **Data deletion request URL**: podés poner `https://TU-SITIO.netlify.app/`.
   - Guardá.
7. Ahí mismo copiá el **Instagram app ID** y el **Instagram app secret** (botón *Show*). Ojo: es el ID/secret **de Instagram**, que aparece dentro de esa pantalla, no el "App ID" general de la app de Facebook que se ve arriba.
8. Volvé a Netlify → **Site configuration → Environment variables → Add a variable**:
   - `IG_APP_ID` = el Instagram app ID
   - `IG_APP_SECRET` = el Instagram app secret
   - Luego **Deploys → Trigger deploy**.
9. En el dashboard → **Ajustes → Conectar Instagram**. Te lleva a Instagram, aceptás los permisos (leer perfil y métricas) y volvés al panel ya conectado; la primera sincronización arranca sola.

**No hace falta pasar la app a "Live" ni enviarla a revisión de Meta**: mientras la app esté en modo desarrollo, funciona para las cuentas agregadas como testers (la tuya). El token dura 60 días y el dashboard lo renueva automáticamente cada vez que sincronizás.

### Si algo falla
- *"Invalid redirect_uri"*: la URL del paso 6 tiene que coincidir letra por letra con `https://TU-SITIO.netlify.app/api/ig/callback`.
- *"User is not a tester"* / *"app not active"*: repetí el paso 5 (Add account) y aceptá la invitación desde Instagram → Configuración → Sitios web y apps → Invitaciones de testers.
- *Métricas en N/A*: `shares` no está disponible para todas las cuentas; `views` reemplaza a `plays` desde 2025. Son límites de Meta, no del dashboard.

---

## 3. Opcionales

| Función | Variable en Netlify | Cómo conseguirla |
|---|---|---|
| Escaneo automático de referentes (Banger Hunter) | `APIFY_TOKEN` | apify.com → cuenta gratis → *Settings → Integrations → API token*. El dashboard usa el actor `apify/instagram-reel-scraper`. Sin esto, agregás bangers pegando URLs (usa Supadata). |
| Elegir fotos de Google Drive en Historias | `GOOGLE_CLIENT_ID` y `GOOGLE_API_KEY` | console.cloud.google.com → proyecto → habilitar *Google Picker API* y *Drive API* → *Credentials*: un **OAuth client ID** (tipo Web, con tu URL de Netlify en *Authorized JavaScript origins*) y una **API key**. Sin esto, subís fotos desde la PC (se guardan en tu navegador). |
| Modelo de IA | `ANTHROPIC_MODEL` | Por defecto `claude-sonnet-4-5`. Podés poner otro modelo de Anthropic. |
| Sesión más segura | `SESSION_SECRET` | Cualquier texto largo aleatorio. Si no está, se deriva de `APP_PASSWORD`. |

---

## Cómo funciona por dentro (resumen)

- **Frontend**: HTML/CSS/JS sin framework en `public/`. Historias exporta PNG 1080×1920 con Canvas y los comprime en ZIP; Variantes renderiza con `ffmpeg.wasm` en tu navegador (el video nunca sale de tu PC).
- **Backend**: Netlify Functions en `netlify/functions/` (Node). Guardan todo en **Netlify Blobs** (sin base de datos externa).
- **Instagram**: *Instagram API with Instagram Login* (`graph.instagram.com`) — perfil, media e insights por reel (`views, reach, saved, shares, likes, comments`).
- **IA**: Anthropic Messages API con tu *kit de marca* + tus números como contexto (`netlify/functions/_lib/ai.mjs`).
- **Transcripción**: Supadata `GET /v1/transcript` por URL del reel; metadatos de videos ajenos con `GET /v1/metadata`.
- **Seguridad**: una sola contraseña (`APP_PASSWORD`) → cookie HttpOnly firmada (HMAC). Todas las llaves viven en variables de entorno de Netlify, nunca en el navegador ni en el repo.

## Desarrollo local

```bash
npm install
APP_PASSWORD=test node scripts/dev-server.mjs          # http://localhost:8888 (datos en memoria)
npm run dev:mock                                        # igual, con Instagram/Anthropic/Supadata simulados
npm test                                                # pruebas de las funciones con APIs simuladas
```
