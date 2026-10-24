# Organizador Pedagógico (PWA)

App web instalable, offline-first y sin suscripciones para docentes de ciencias.
**Estado:** Módulo 1 (Bibliotecas, Planeación y Recursos) funcional. Módulos 2–4 son marcadores de posición (sus rutas existen pero están fuera del menú hasta que se construyan).

## Cómo está organizada
- **Inicio** = clases de hoy (si hay) + **bibliotecas** (tarjetas con icono, color y cantidad de documentos) + lo reciente.
- **Mis clases** es la biblioteca de siempre: Grado → Materia → Unidad → Tema (pantalla `estructura.js`).
- **Maestría, Estudio, Personal** (y las que crees) son bibliotecas libres: carpetas de un nivel → documentos (`biblioteca.js`).
- **Buscar** encuentra documentos de todas las bibliotecas; los filtros finos están en «Más filtros».
- Un documento sin `libraryId` pertenece a «Mis clases» (así lo anterior a las bibliotecas no se migró).
- Menú: Inicio · Buscar · Planeación · Ajustes.

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
js/db.js              IndexedDB (v2): CRUD, índices multi-entrada, borrado lógico, cola de sync, respaldo
js/store.js           bibliotecas y carpetas, filtrado matricial (biblioteca·carpeta·grado·materia·unidad·tema·tipo·texto) y siembra inicial
js/drive.js           Google Drive personal (scope drive.file, tu propio Client ID)
js/app.js             arranque y router por hash
js/views/             inicio, biblioteca, banco («Buscar»), recurso-form, estructura («Mis clases»), planeacion, ajustes, pronto
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
