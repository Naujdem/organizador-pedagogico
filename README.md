# Organizador Pedagógico (PWA)

App web instalable, offline-first y sin suscripciones para docentes de ciencias.
**Estado:** Módulo 1 (Planeación y Recursos) funcional. Módulos 2–4 son marcadores de posición.

Sin build ni dependencias de ejecución: HTML + ES modules + IndexedDB, como la app de referencia (Biotaxo dex).

## Probar
```bash
npm start            # sirve en http://localhost:5173 (los service workers requieren localhost o HTTPS)
npm install && npm test
```
Para publicarla gratis: GitHub Pages, Netlify o Cloudflare Pages (cualquier hosting estático con HTTPS).

## Estructura
```
index.html            cascarón + navegación (barra inferior en móvil, lateral en escritorio)
sw.js                 service worker: precarga la app y funciona sin internet
manifest.webmanifest  instalación como app
js/db.js              IndexedDB: CRUD, índices multi-entrada, borrado lógico, cola de sync, respaldo
js/store.js           filtrado matricial (grado·materia·unidad·tema·tipo·texto) y siembra inicial
js/drive.js           Google Drive personal (scope drive.file, tu propio Client ID)
js/app.js             arranque y router por hash
js/views/             banco, recurso-form, estructura, planeacion, inicio, ajustes, pronto
tests/                pruebas de datos/filtros y de humo de la interfaz
```

## Google Drive (opcional)
1. Google Cloud Console → crea un proyecto → habilita *Google Drive API*.
2. Credenciales → *ID de cliente OAuth* tipo «Aplicación web»; en *Orígenes autorizados* pon la URL donde publiques la app.
3. Pega el Client ID en **Ajustes → Google Drive** y toca *Conectar*.
Los archivos van a la carpeta «Organizador Pedagógico» de tu Drive; la app solo ve lo que ella sube.

## Pendiente / decisiones abiertas
- **Sincronización de registros**: cada escritura ya queda en `syncQueue`, pero aún no se sube a Drive (hoy solo se suben archivos). Siguiente paso: volcar el log de cambios a un JSON en Drive y resolver conflictos por `updatedAt`.
- **El respaldo JSON no incluye los archivos locales** (blobs); solo los datos. Los archivos subidos a Drive sí se conservan allí.
- Vincular estudiantes a un PADA depende del Módulo 4.
- Cambiar `CACHE` en `sw.js` cada vez que modifiques archivos de la app.
