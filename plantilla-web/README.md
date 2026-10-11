# plantilla-web

Base para webs de negocios locales con pedidos por WhatsApp. Vite + React + TypeScript + Tailwind v4, 100 % estática.

## Usar para un negocio nuevo
1. Copiar la carpeta: `cp -r plantilla-web ../mi-negocio && cd ../mi-negocio && npm i`
2. Editar `src/data/menu.json`: nombre, WhatsApp (con 57), horario, zonas, pagos, productos y opciones. Los precios nunca van en el código.
3. Editar colores y fuentes en `src/index.css` (bloque `@theme`).
4. Editar `<title>`, descripción y og:image en `index.html`; fotos en `public/img/` y `imagen` en el JSON.
5. `npm run dev` para ver · `npm test` · `npm run build` → subir `dist/` a Netlify/Cloudflare Pages.

## Qué trae
- Menú por categorías, ficha con opciones (min/max, incluidas gratis), precio en vivo.
- Carrito (persiste en localStorage), checkout validado, mensaje a WhatsApp con código de pedido.
- Abierto/Cerrado con hora de Bogotá (incluye franjas que pasan de medianoche).
- `src/lib/pedido.ts` = lógica pura, con pruebas en `pedido.test.ts`.

## No trae (agregar por proyecto)
Animaciones de scroll, fotos/video, sección "Cómo pedir", ubicación, FAQ, JSON-LD.
