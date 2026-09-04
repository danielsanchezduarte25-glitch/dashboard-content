# Dashboard Content

Panel privado para creadores de Instagram: métricas reales de tus reels (API oficial de Meta), análisis IA de cada video (hook · retención · CTA · mejoras), **Banger Hunter** para detectar qué viraliza entre tus referentes y adaptarlo a tu marca, **AI Chat** estratega con tu kit de marca y tus números, editor de **Historias** 9:16 con exportación PNG, **Variantes de video** renderizadas en el navegador y **Calendario** editorial.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/danielsanchezduarte25-glitch/dashboard-content)

**Guía completa de instalación (Netlify + app de Meta + opcionales): [docs/SETUP.md](docs/SETUP.md)**

## Módulos

| Módulo | Qué hace | Datos |
|---|---|---|
| Dashboard | KPIs (seguidores, reach, guardados, ER, reels, mediana, compartidos, mejor horario), reach mes a mes, objetivos, últimos reels. Vistas = las que muestra Instagram (incluyen promociones); sync automático diario | Instagram Graph API + Apify |
| Instagram | Grilla de reels con filtros y buscador; panel con métricas privadas, transcripción y análisis IA descargable | Meta + Supadata + Anthropic |
| Inspiración | Referentes, escaneo (Apify) o carga por URL (Supadata), score viral vs. mediana de la cuenta, "Adaptar a mi marca" | Supadata/Apify + Anthropic |
| AI Chat | Conversaciones persistentes con un estratega que conoce tu kit de marca, tus reels y sus análisis | Anthropic |
| Historias | Secuencias de slides, capas de texto arrastrables, dibujo, fondos (PC / URL / Drive), export ZIP de PNG 1080×1920 | Canvas + JSZip |
| Variantes | 5–10 re-ediciones (velocidad, zoom, contraste, saturación, temperatura, recorte, texto) con `ffmpeg.wasm` | local |
| Publicar | Subí reels, fotos, carruseles e historias; caption con IA; publicá ahora o programá (cola cada 5 min) | Instagram Content Publishing API + Netlify Blobs |
| Calendario | Reels publicados + posts programados + agenda de reels/stories/pruebas, próximos 7 días | Netlify Blobs |
| Ajustes | Conexiones, objetivos y kit de marca | Netlify Blobs |

## Stack

Frontend estático (`public/`) · Netlify Functions v2 (`netlify/functions/`) · Netlify Blobs · Instagram API with Instagram Login · Anthropic Messages API · Supadata · Apify (opcional) · Google Picker (opcional).

## Variables de entorno

| Variable | Obligatoria | Uso |
|---|---|---|
| `APP_PASSWORD` | sí | Contraseña del panel |
| `ANTHROPIC_API_KEY` | para IA | Análisis, chat, adaptaciones |
| `SUPADATA_API_KEY` | para transcripción | Transcripciones y metadatos de reels |
| `IG_APP_ID`, `IG_APP_SECRET` | para Instagram | App de Meta (ver guía) |
| `APIFY_TOKEN` | opcional | Escaneo automático de referentes |
| `GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY` | opcional | Fotos desde Google Drive |
| `ANTHROPIC_MODEL`, `SESSION_SECRET`, `IG_GRAPH_VERSION` | opcional | Ajustes finos |

## Desarrollo

```bash
npm install
npm run dev:mock   # http://localhost:8888 con APIs simuladas
npm test
```
