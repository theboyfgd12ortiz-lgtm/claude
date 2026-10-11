import type { Datos, Horario, Linea, Menu, Producto, Seleccion } from "./tipos";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
export const formatoCOP = (n: number) => cop.format(n);

/** Precio de una unidad. Las opciones más baratas del grupo son las `incluidas` gratis. */
export function precioUnitario(p: Producto, sel: Seleccion): number {
  let total = p.precio;
  for (const g of p.grupos ?? []) {
    const precios = (sel[g.id] ?? [])
      .map((id) => g.opciones.find((o) => o.id === id)?.precio ?? 0)
      .sort((a, b) => a - b);
    total += precios.slice(g.incluidas ?? 0).reduce((a, b) => a + b, 0);
  }
  return total;
}

/** Mensaje de lo que falta o sobra en la selección; null si es válida. */
export function problemaSeleccion(p: Producto, sel: Seleccion): string | null {
  for (const g of p.grupos ?? []) {
    const ids = sel[g.id] ?? [];
    if (ids.some((id) => !g.opciones.some((o) => o.id === id))) return `Opción inválida en ${g.nombre}`;
    if (ids.length < g.min) return g.max === 1 ? `Elige ${g.nombre.toLowerCase()}` : `Elige al menos ${g.min} en ${g.nombre.toLowerCase()}`;
    if (ids.length > g.max) return `Máximo ${g.max} en ${g.nombre.toLowerCase()}`;
  }
  return null;
}

export const subtotal = (lineas: Linea[], productos: Producto[]) =>
  lineas.reduce((s, l) => {
    const p = productos.find((x) => x.id === l.productoId);
    return p ? s + precioUnitario(p, l.seleccion) * l.cantidad : s;
  }, 0);

export const costoEnvio = (menu: Menu, d: Pick<Datos, "entrega" | "zonaId">) =>
  d.entrega === "domicilio" ? (menu.negocio.zonas.find((z) => z.id === d.zonaId)?.costo ?? 0) : 0;

// --- Horario (siempre hora de Colombia, no la del celular) ---
function ahoraBogota(fecha: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(fecha).map((x) => [x.type, x.value]),
  );
  return { dia: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), min: Number(p.hour) * 60 + Number(p.minute) };
}
const aMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };

export function estaAbierto(horario: Horario, fecha = new Date()): boolean {
  const { dia, min } = ahoraBogota(fecha);
  for (const [ini, fin] of horario[dia] ?? []) {
    const i = aMin(ini), f = aMin(fin);
    if (f > i ? min >= i && min < f : min >= i) return true;
  }
  for (const [ini, fin] of horario[(dia + 6) % 7] ?? []) { // madrugada de la franja de ayer
    if (aMin(fin) <= aMin(ini) && min < aMin(fin)) return true;
  }
  return false;
}

// --- Checkout ---
export const celularValido = (c: string) => /^3\d{9}$/.test(c.replace(/\s/g, ""));

export function erroresCheckout(menu: Menu, d: Datos, sub: number): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.nombre.trim()) e.nombre = "Escribe tu nombre";
  if (!celularValido(d.celular)) e.celular = "Celular de 10 dígitos que empieza por 3";
  if (d.entrega === "domicilio") {
    if (!d.zonaId) e.zonaId = "Elige tu zona";
    if (!d.direccion.trim()) e.direccion = "Escribe tu dirección";
  }
  if (!d.pago) e.pago = "Elige cómo pagas";
  if (sub < menu.negocio.pedidoMinimo) e.minimo = `El pedido mínimo es ${formatoCOP(menu.negocio.pedidoMinimo)}`;
  return e;
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O/0/I/1
export const codigoPedido = () => "#" + Array.from({ length: 4 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join("");

export function mensajeWhatsApp(menu: Menu, lineas: Linea[], d: Datos, codigo: string, fecha = new Date()): string {
  const hora = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(fecha);
  const out = [`*Nuevo pedido ${codigo} - ${menu.negocio.nombre}*`, hora, ""];
  for (const l of lineas) {
    const p = menu.productos.find((x) => x.id === l.productoId);
    if (!p) continue;
    out.push(`${l.cantidad}x ${p.nombre} — ${formatoCOP(precioUnitario(p, l.seleccion) * l.cantidad)}`);
    for (const g of p.grupos ?? []) {
      const nombres = (l.seleccion[g.id] ?? []).map((id) => g.opciones.find((o) => o.id === id)?.nombre).filter(Boolean);
      if (nombres.length) out.push(`   • ${g.nombre}: ${nombres.join(", ")}`);
    }
    if (l.nota.trim()) out.push(`   📝 ${l.nota.trim()}`);
  }
  const sub = subtotal(lineas, menu.productos), envio = costoEnvio(menu, d);
  out.push("", `Subtotal: ${formatoCOP(sub)}`);
  if (d.entrega === "domicilio") out.push(`Domicilio: ${formatoCOP(envio)}`);
  out.push(`*Total: ${formatoCOP(sub + envio)}*`, "", `Nombre: ${d.nombre.trim()}`, `Celular: ${d.celular}`);
  out.push(d.entrega === "domicilio"
    ? `Dirección: ${d.direccion.trim()} (${menu.negocio.zonas.find((z) => z.id === d.zonaId)?.nombre})`
    : "Recoge en el local");
  out.push(`Pago: ${d.pago}${d.pago === "Efectivo" && d.efectivoCon ? ` (paga con ${d.efectivoCon})` : ""}`);
  return out.join("\n");
}

export const urlWhatsApp = (numero: string, texto: string) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
