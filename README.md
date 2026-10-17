# Cauce — Plataforma de streaming

Rediseño de la aplicación de WebRTC para Programación Web II. La portada está en `/`, el estudio en `/emisor` y la sala en `/receptor`. La identidad, los componentes, la explicación para exponer y los límites de las pruebas están en [DISENO Y EXPLICACION.md](DISENO%20Y%20EXPLICACION.md). Las capturas de computadora y teléfono están en `evidencias/`.

La interfaz usa HTML, CSS y JavaScript sin agregar un framework. Incluye navegación responsive, colecciones filtrables, diálogos, preferencias locales de seguimiento y copia del enlace de la sala. Los canales y el contador no se simulan: hay una sala principal real y las colecciones se identifican como propuestas.

## Transmisión WebRTC a múltiples receptores

Un emisor captura cámara y micrófono una vez y crea una conexión WebRTC independiente para cada receptor. No hay un límite de 15 receptores en el código. Firebase solo transporta señalización; el audio y video van directamente desde el emisor a cada espectador.

## Ejecutar

Desde esta carpeta:

```powershell
npm install
npm start
```

1. Abre `http://localhost:3000/emisor` y pulsa **Iniciar transmisión**.
2. Cada espectador abre `/receptor` en la misma dirección pública y pulsa **Conectar**. No debe usar `localhost` en su propio equipo.
3. Si el navegador bloquea la reproducción automática con audio, pulsa **Reproducir video y audio**.
4. El emisor muestra cuántos receptores están conectados. Cada espectador puede desconectarse sin afectar al resto.

Para usuarios en otros equipos, sirve la aplicación por HTTPS. La cámara necesita un contexto seguro (HTTPS o localhost). No se configura hosting ni un túnel automáticamente.

Los receptores que conectan antes del emisor esperan. Si este detiene y vuelve a iniciar, los espectadores que siguen esperando se unen a la nueva sesión. Un segundo emisor no puede reemplazar una transmisión activa. Firebase debe permitir lectura, escritura y transacciones en `rooms/main`; no se modificaron las reglas de tu proyecto.

## Capacidad para más de 15 personas

La captura solicita 640 × 360 a 20 fps, con máximo de 24 fps. El video se limita a 450 kbps por receptor, más audio y tráfico de protocolo. Para 20 espectadores, el presupuesto máximo de video suma aproximadamente **9 Mbps de subida**, antes de audio y otros gastos. Conviene disponer de margen por encima de esa cifra. El resultado depende del procesador, navegador, conexión y redes de los receptores.

Esta solución mantiene conexiones directas desde el emisor a cada receptor. Para asegurar capacidad en redes limitadas o aumentar mucho la audiencia, se necesita un servidor de medios SFU, que reciba una transmisión y la distribuya. Este proyecto no incluye un SFU.

La configuración actual tiene servidores STUN. Algunas redes requieren un servidor TURN; puede añadirse a `RTC_CONFIG.iceServers` con sus credenciales. No se añadieron servicios ni credenciales externas.

## Señalización y limpieza

```text
rooms/main/
  sessionId
  sessions/<sessionId>/
    active
    viewers/<viewerId>/
      joined
      offer
      answer
      callerCandidates/<candidateId>
      calleeCandidates/<candidateId>
```

Cada sesión y receptor tienen un identificador único. Las ofertas, respuestas y candidatos ICE no se comparten entre espectadores. Los candidatos recibidos antes de la descripción remota se guardan hasta que puedan procesarse. `onDisconnect` elimina la sesión o el receptor correspondiente al cerrarse su conexión con Firebase.

## Verificación

## Compartir pantalla y reacciones

En el estudio, inicia la transmisión y pulsa **Compartir pantalla**. El selector del navegador permite elegir un escritorio, ventana o pestaña según su compatibilidad. **Detener pantalla / Volver a cámara** termina la captura y restaura la cámara; el botón del navegador para dejar de compartir hace lo mismo. **Detener** finaliza toda la transmisión. Si cancelas el selector, sigues con la cámara.

Se reemplaza únicamente la pista de video de cada conexión mediante `RTCRtpSender.replaceTrack()`, conservando el micrófono y las conexiones. La cámara se mantiene disponible mientras compartes. No se captura audio del sistema. Los espectadores que llegan durante la captura reciben la pantalla. La captura solicita 1280 × 720; mantiene el límite de 450 kbps por receptor del proyecto base.

Los botones 💗 👍 😂 😮 🔥 envían reacciones por un canal de datos WebRTC. El emisor las retransmite a todos los espectadores y también las muestra. Se animan sobre el reproductor y se eliminan después de 2.4 segundos. No se guarda historial en Firebase. Se limitan la frecuencia de envío y la cantidad de elementos visibles; se respeta la preferencia de movimiento reducido.

### Guion para el video de evidencia

1. Abre el estudio y dos pestañas de receptor; inicia y conecta ambas.
2. Muestra la cámara, comparte una ventana y verifica que ambos receptores la vean.
3. Vuelve a cámara sin desconectar receptores; comparte otra vez y detén desde el aviso del navegador.
4. Envía distintas reacciones desde cada receptor y comprueba que aparecen también en el otro y en el estudio.
5. Detén la transmisión y muestra que se liberan las capturas.

El video de evidencia debe grabarse con permisos reales del navegador. Las pruebas automatizadas usan simulaciones; no sustituyen esta comprobación ni constituyen una grabación de la transmisión.

### Pruebas automatizadas

```powershell
npm test
```

Las pruebas simulan Firebase, las conexiones WebRTC y 20 receptores simultáneos. Verifican señalización independiente, candidatos ICE antes del SDP, entrada tardía, salida individual, reconexión, protección frente a un segundo emisor, reinicio y limpieza de listeners. No miden video real, calidad de audio, CPU, ancho de banda, reglas reales de Firebase ni conectividad entre redes.

Para validar la capacidad real, conecta al menos 16 dispositivos o navegadores a la dirección HTTPS, comprueba video y audio simultáneos, observa el contador y prueba desconectar y volver a conectar un receptor mientras los demás siguen viendo.

Referencias: [candidatos ICE y descripción remota](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addIceCandidate), [limpieza al desconectar de Firebase](https://firebase.google.com/docs/database/web/offline-capabilities), [transacciones en Firebase](https://firebase.google.com/docs/database/web/read-and-write).
