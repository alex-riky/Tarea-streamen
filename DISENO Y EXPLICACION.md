# Cauce — Plataforma de streaming

**Estudiante:** Isidro Alexander Chuj Quijivix · 231621  
**Curso:** Programación Web II · Universidad del Valle de Guatemala

## Idea del proyecto

Para este trabajo transformé la aplicación de WebRTC en una plataforma llamada Cauce. Elegí ese nombre porque quería relacionar el flujo de un río con el intercambio de ideas. La plataforma está pensada para compartir programación, proyectos y aprendizaje desde el Altiplano. Tomé como referencia la claridad de las plataformas de streaming, pero hice mi propia marca, composición y contenido.

## Decisiones que puedo explicar

- **Colores:** el azul tinta `#101d32` es el fondo, el azul `#182a45` separa las superficies, el celeste `#66d4e8` identifica las acciones principales y el arena `#f3bb70` aporta detalles cálidos. El texto principal usa `#edf2f8` y el secundario `#a6b6cc`.
- **Tipografía:** Bahnschrift da personalidad a los títulos; Segoe UI mantiene legibles los controles y textos; Consolas se utiliza en la ilustración de código. Hay fuentes alternativas del sistema, así que no es necesario descargar tipografías.
- **Símbolo:** las dos ondas de la marca representan el flujo y la conexión. La ilustración de código y las tarjetas se construyeron con HTML y CSS; no dependen de imágenes externas.
- **Inicio:** primero presento el canal principal y su acceso; después muestro colecciones de ideas que se pueden filtrar. Las colecciones son ilustrativas y abren una explicación, no prometen videos inexistentes.
- **Sala:** el video, los botones, el estado de conexión y la información del creador están dentro del mismo panel. Mantengo visible la diferencia entre no tener señal y recibir una transmisión.
- **Estudio:** separé la acción de transmitir de la acción de ver. El estudio incluye vista previa, iniciar/detener, contador real de conexiones y consejos para preparar el directo.
- **Responsive:** en computadora hay barra superior y navegación lateral. En teléfono la navegación se abre con un botón, las columnas se apilan y las tarjetas se vuelven horizontales. Comprobé anchos de 390 y 320 píxeles sin desbordamiento horizontal.
- **Interacción:** botones y tarjetas tienen hover y foco visible; los controles deshabilitados se distinguen, los filtros muestran su selección y los diálogos se pueden cerrar con Escape. El diseño respeta la preferencia de movimiento reducido.

## Qué es real y qué es de presentación

El audio y video, la captura de cámara, la conexión, desconexión y el contador del emisor son reales. El nombre del canal, la descripción, el avatar con iniciales y las colecciones son contenido de presentación. Seguir canal guarda una preferencia únicamente en este navegador mediante localStorage; no crea una cuenta ni envía notificaciones. Compartir copia la dirección de la sala. No añadí un chat falso ni cifras de espectadores inventadas.

## Cómo está organizado el código

| Archivo | Función |
| --- | --- |
| `public/index.html` | Inicio y colecciones. |
| `public/receptor/index.html` | Sala del espectador. |
| `public/emisor/index.html` | Estudio del creador. |
| `public/style.css` | Colores, componentes y reglas responsive. |
| `public/ui.js` | Menú, filtros, diálogos, seguir, compartir y pantalla completa. |
| `public/emisor/emisor.js` | Captura y conexiones hacia los espectadores. |
| `public/receptor/receptor.js` | Espera de la sala, recepción y reproducción. |
| `public/signaling.js` | Negociación y cola de candidatos ICE. |
| `public/firebase-config.js` | Configuración existente de Firebase y STUN. |
| `server.js` | Servidor Express que entrega las páginas. |

En CSS, `:root` centraliza los colores. Grid organiza las columnas principales; Flexbox organiza controles y etiquetas. Las media queries cambian la composición según el ancho. Para mostrar contenido dinámico uso `textContent`, evitando interpretar los textos como HTML.

## Funcionamiento del directo

El emisor pide acceso a cámara y micrófono. Firebase coordina la oferta, la respuesta y los candidatos de conexión. Cada espectador tiene su propio identificador y su propia conexión WebRTC. Firebase no almacena el video: los medios viajan entre los navegadores. La transacción de la sala evita que un segundo emisor sustituya al que ya está transmitiendo. Los candidatos que llegan antes de la descripción remota se guardan hasta poder aplicarlos.

Corregí inconsistencias que existían entre el código y las pruebas: aislamiento de sesiones, espera antes del directo, reinicio, limpieza de listeners y el botón para reproducir cuando el navegador bloquea el audio automático. La cámara solicita 640 × 360 y el límite de video es 450 kbps por receptor; el ancho de banda necesario crece con cada espectador.

## Ejecutar y demostrar

Desde esta carpeta:

```powershell
npm install
npm start
```

1. Abrir `http://localhost:3000` para mostrar el inicio.
2. Entrar en **Mi estudio**, pulsar **Iniciar transmisión** y permitir cámara y micrófono.
3. En otra pestaña abrir `/receptor` y pulsar **Conectar al directo**.
4. Si el navegador bloquea el audio, pulsar **Reproducir video y audio**.
5. Probar desconectar un espectador, reiniciar el directo y reducir el ancho de la ventana.

Si el puerto está ocupado:

```powershell
$env:PORT = '3083'
npm start
```

Para otros equipos se necesita una dirección HTTPS accesible. Un enlace que contiene localhost solo funciona en el equipo donde corre el servidor. Algunas redes necesitan TURN; el proyecto conserva STUN y no incorpora un servicio TURN ni un servidor de distribución SFU. Las reglas del proyecto Firebase deben permitir las operaciones de la sala.

## Validación realizada

`npm test`: cuatro pruebas aprobadas. Comprueban 20 receptores simulados, conexión independiente, salida y reconexión, protección de un segundo emisor, reinicio, limpieza de listeners, candidatos ICE anticipados, permiso de cámara denegado y recuperación de autoplay. En navegador comprobé las páginas, los filtros, el diálogo, la navegación móvil y conectar/desconectar en espera. Las capturas están en `evidencias/`.

Las pruebas de 20 receptores usan dobles de Firebase y WebRTC. No equivalen a transmitir video real a 20 dispositivos. Queda por comprobar cámara y audio reales entre dispositivos, permisos y reglas de Firebase, conectividad de red y rendimiento con audiencia real.

## Resumen para exponer

“Mi propuesta se llama Cauce y está dirigida a compartir proyectos y aprender en comunidad. Elegí una identidad azul con celeste para las acciones principales y un símbolo de ondas relacionado con el flujo de ideas. Organicé la aplicación en descubrir, sala de directo y estudio, para que cada tarea tenga un lugar claro. Integré el reproductor con la información del creador y los controles. En teléfono las columnas se apilan y el menú se puede desplegar. Conservé WebRTC y Firebase para la transmisión y añadí interacciones de interfaz sin simular funciones que no tiene el backend.”
