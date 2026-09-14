# GeoPhoto Studio

🌐 **Usar:** https://mauricespinoza.github.io/ClaudeCoding/geophoto/

App web para gestionar fotografías con metadata de localización: mapa, exportación a
Google Earth (KML/KMZ) y editor vectorial de anotaciones con rótulos de rumbo.

Todo corre en el navegador: las imágenes nunca salen del equipo (se guardan en IndexedDB)
salvo que tú las exportes.

## Funcionalidades

### 1. Ingesta de fotos

- **Desde el PC**: arrastrar y soltar en cualquier parte de la ventana, selector de
  archivos o carpeta completa. Al importar se lee el EXIF: GPS (lat/lon/altitud), rumbo
  de cámara (`GPSImgDirection`), focal equivalente a 35 mm, fecha, cámara y orientación.
- **Archivos `.zip`** (la vía recomendada para Google Photos): se descomprimen en el
  navegador y se importan todas sus imágenes. Si el `.zip` viene de Google Photos o de
  Google Takeout, se leen además los **sidecar JSON** que Google incluye junto a cada foto
  (`IMG_1234.jpg.json` o `IMG_1234.jpg.supplemental-metadata.json`) para recuperar las
  coordenadas y la fecha **aunque el JPEG venga sin EXIF**, que es lo habitual al
  descargar desde la web. El EXIF de la foto siempre tiene prioridad sobre el sidecar;
  las posiciones `0,0` que Google escribe cuando no conoce la ubicación se descartan.
- **Google Photos**: pegando el enlace de un álbum compartido. Google Photos no envía
  cabeceras CORS, así que el navegador no puede leer el álbum por sí solo; hay que
  configurar un **proxy CORS** en Ajustes (`https://mi-proxy/?url={url}`). Las imágenes se
  piden con el sufijo `=d` para obtener el original con su EXIF.
- **URLs sueltas**: pegar una lista de URLs de imágenes (una por línea).

Las fotos sin GPS se pueden ubicar a mano: botón «Ubicar» y clic en el mapa. Cualquier
marcador se puede arrastrar para corregir su posición.

### 2. Mapa

Vistas **Mapa / Satélite / Híbrido / Terreno**.

- Con una **Google Maps JavaScript API key** (Ajustes) se usa Google Maps.
- Sin key la app funciona igual con un mapa base libre: OpenStreetMap, Esri World Imagery
  y OpenTopoMap. Si Google Maps falla al cargar, cae automáticamente a este mapa.

### 3. Panel de filas y exportación a KML/KMZ

Tabla con miniatura, título editable, coordenadas, rumbo (rosa de los vientos), fecha y
acciones. Búsqueda, filtros y selección múltiple.

La exportación produce:

- **KMZ** (recomendado): un solo archivo con `doc.kml` y las imágenes empaquetadas. Cada
  marcador abre un globo con la miniatura; **al hacer clic en la miniatura se abre la
  imagen completa**. Incluye `LookAt` con el rumbo de la cámara, `ExtendedData` con toda la
  metadata y, opcionalmente, un polígono con el **cono de visión**.
- **KML** plano, con las imágenes referenciadas por URL remota o incrustadas en base64.

Si una foto tiene una versión anotada guardada desde el editor, se usa esa imagen.

### 4. Editor vectorial

Editor tipo Illustrator sobre la foto, con todo el dibujo en SVG (coordenadas en píxeles
de la imagen original, así la exportación a cualquier resolución es exacta).

Herramientas: selección, edición de nodos, pluma Bézier, trazo libre vectorizado, línea,
flecha, polígono, rectángulo, elipse, texto y desplazamiento.

- **Nodos y curvas**: arrastrar nodos y manejadores Bézier, `Alt+clic` para alternar entre
  esquina y curva suave, doble clic sobre el trazo para insertar un nodo.
- **Estilo**: color, grosor, opacidad y tipo de trazo; relleno con opacidad independiente
  (transparencias reales); puntas de flecha en inicio y fin; tipografía, tamaño,
  alineación y halo de legibilidad para los textos.
- **Objetos**: lista de capas con orden, visibilidad y bloqueo.
- Deshacer/rehacer, duplicar, mover con flechas, multiselección y marco de selección.

#### Rótulos de rumbo (rosa de los vientos)

Un interruptor añade las **direcciones cardinales en las esquinas superiores izquierda y
derecha** de la foto. Se calculan como `rumbo ∓ campo_de_visión / 2` y se redondean al
punto más cercano de la rosa de los vientos, con rumbos intermedios (**NNE, ESE, SSW,
WNW**…). Se puede elegir precisión de 8, 16 o 32 rumbos.

- El rumbo sale del EXIF (`GPSImgDirection`) y el campo de visión de la focal equivalente
  a 35 mm (`FOV = 2·atan(36 / 2f)`); ambos son ajustables a mano.
- Configurables: mostrar grados, tamaño de letra, colores, placa de fondo y margen.

#### Exportación

**PNG, TIFF, PDF, SVG** y JPEG, con **resolución ajustable** (×0.25 a ×4 o ancho exacto
en píxeles) y DPI declarados (72/150/300/600).

| Formato | Notas |
| --- | --- |
| SVG | Vectorial, editable en Illustrator/Inkscape, con la foto incrustada |
| PDF | Vectorial vía `svg2pdf.js`; el tamaño de página sale de los DPI elegidos |
| PNG | Alfa real y DPI escritos en el chunk `pHYs` |
| TIFF | RGBA sin compresión con `XResolution`/`YResolution` |

Opciones: fondo transparente y exportar **solo las anotaciones** sin la fotografía, para
superponerlas en otro programa.

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # build de producción en dist/
npm run preview  # sirve el build
```

## Despliegue

Es un sitio estático (`dist/`). Para publicarlo en Netlify apuntando a esta carpeta:

```toml
[build]
  base = "geophoto"
  command = "npm run build"
  publish = "dist"
```

El `netlify.toml` de la raíz del repositorio apunta a la otra app (`app/`); cámbialo o usa
un sitio distinto para esta.

## Ajustes

| Ajuste | Para qué |
| --- | --- |
| Google Maps API key | Activa Google Maps. Se guarda solo en este navegador; conviene restringirla por dominio |
| Proxy CORS | Necesario para leer álbumes de Google Photos y descargar sus imágenes |
| Puntos de la rosa de los vientos | 8, 16 o 32 rumbos |
| Campo de visión por defecto | Se usa cuando el EXIF no trae la focal |

## Limitaciones conocidas

- Google Photos no permite lectura directa desde el navegador (CORS); requiere proxy.
  Además, las imágenes servidas por Google Photos suelen venir sin GPS salvo que se pidan
  como original (`=d`) y el álbum lo permita. **Por eso la vía recomendada es descargar el
  álbum y soltar el `.zip`**, que conserva los originales y sus sidecar JSON.
- El `.zip` se descomprime en memoria: archivos de varios GB pueden agotar la memoria de
  la pestaña. Para exports muy grandes, divídelos en varios `.zip`.
- Los formatos HEIC/HEIF no se decodifican; conviértelos a JPEG antes de importarlos.
- El TIFF se escribe sin compresión, por lo que los archivos son grandes.
