import { useState } from "react";
import { X } from "lucide-react";
import { codigoPedido, costoEnvio, erroresCheckout, formatoCOP, mensajeWhatsApp, precioUnitario, subtotal, urlWhatsApp } from "../lib/pedido";
import type { Datos, Linea, Menu } from "../lib/tipos";

type Props = {
  menu: Menu; lineas: Linea[]; abierto: boolean;
  onCantidad: (key: string, delta: number) => void; onCerrar: () => void; onTerminar: () => void;
};

const campo = "mt-1 w-full rounded-xl border-2 border-tinta/15 px-3 font-normal";

export function Checkout({ menu, lineas, abierto, onCantidad, onCerrar, onTerminar }: Props) {
  const n = menu.negocio;
  const [d, setD] = useState<Datos>({ nombre: "", celular: "", entrega: n.entrega.domicilio ? "domicilio" : "recoger", zonaId: "", direccion: "", pago: n.pagos[0], efectivoCon: "" });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviado, setEnviado] = useState<{ codigo: string; url: string } | null>(null);
  const sub = subtotal(lineas, menu.productos);
  const total = sub + costoEnvio(menu, d);
  const set = <K extends keyof Datos>(k: K, v: Datos[K]) => setD((x) => ({ ...x, [k]: v }));

  function enviar() {
    const e = erroresCheckout(menu, d, sub);
    setErrores(e);
    if (Object.keys(e).length) return;
    const codigo = codigoPedido();
    const url = urlWhatsApp(n.whatsapp, mensajeWhatsApp(menu, lineas, d, codigo));
    setEnviado({ codigo, url });
    window.open(url, "_blank");
  }

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Tu pedido">
      <div className="h-full w-full overflow-y-auto bg-fondo p-5 sm:max-w-md">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl">{enviado ? `Pedido ${enviado.codigo}` : "Tu pedido"}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="grid w-11 place-items-center rounded-full"><X /></button>
        </div>

        {enviado ? (
          <div className="mt-4 space-y-3">
            <p>Se abrió WhatsApp con tu pedido. Si no se envió, ábrelo de nuevo y toca enviar.</p>
            <a href={enviado.url} target="_blank" rel="noreferrer" className="grid min-h-12 place-items-center rounded-xl bg-ok font-semibold text-white">Volver a abrir WhatsApp</a>
            <button onClick={onTerminar} className="min-h-12 w-full rounded-xl border-2 border-tinta/20 font-semibold">Ya lo envié</button>
          </div>
        ) : lineas.length === 0 ? (
          <p className="mt-4 opacity-70">Tu pedido está vacío. Empieza por el menú.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-tinta/10">
              {lineas.map((l) => {
                const p = menu.productos.find((x) => x.id === l.productoId);
                if (!p) return null;
                return (
                  <li key={l.key} className="flex items-center gap-2 py-2">
                    <span className="flex-1">{p.nombre}<br /><small className="opacity-60">{formatoCOP(precioUnitario(p, l.seleccion))} c/u</small></span>
                    <button onClick={() => onCantidad(l.key, -1)} aria-label={`Quitar uno de ${p.nombre}`} className="w-11">−</button>
                    <span>{l.cantidad}</span>
                    <button onClick={() => onCantidad(l.key, 1)} aria-label={`Agregar uno de ${p.nombre}`} className="w-11">+</button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 space-y-3">
              <label className="block font-semibold">Nombre<input value={d.nombre} onChange={(e) => set("nombre", e.target.value)} className={campo} autoComplete="name" /><Err m={errores.nombre} /></label>
              <label className="block font-semibold">Celular<input value={d.celular} onChange={(e) => set("celular", e.target.value)} inputMode="numeric" className={campo} autoComplete="tel" /><Err m={errores.celular} /></label>

              {n.entrega.domicilio && n.entrega.recoger && (
                <div className="flex gap-2">
                  {(["domicilio", "recoger"] as const).map((v) => (
                    <button key={v} onClick={() => set("entrega", v)} aria-pressed={d.entrega === v} className={`flex-1 rounded-xl border-2 font-semibold ${d.entrega === v ? "border-marca bg-marca text-white" : "border-tinta/15"}`}>
                      {v === "domicilio" ? "Domicilio" : "Recoger"}
                    </button>
                  ))}
                </div>
              )}
              {d.entrega === "domicilio" && (
                <>
                  <label className="block font-semibold">Zona
                    <select value={d.zonaId} onChange={(e) => set("zonaId", e.target.value)} className={campo}>
                      <option value="">Elige tu zona</option>
                      {n.zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre} · {formatoCOP(z.costo)}</option>)}
                    </select><Err m={errores.zonaId} />
                  </label>
                  <label className="block font-semibold">Dirección<input value={d.direccion} onChange={(e) => set("direccion", e.target.value)} className={campo} autoComplete="street-address" /><Err m={errores.direccion} /></label>
                </>
              )}
              <label className="block font-semibold">Pago
                <select value={d.pago} onChange={(e) => set("pago", e.target.value)} className={campo}>{n.pagos.map((p) => <option key={p}>{p}</option>)}</select>
              </label>
              {d.pago === "Efectivo" && (
                <label className="block font-semibold">¿Con cuánto pagas?<input value={d.efectivoCon} onChange={(e) => set("efectivoCon", e.target.value)} inputMode="numeric" className={campo} /></label>
              )}
            </div>

            <dl className="mt-4 space-y-1">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatoCOP(sub)}</dd></div>
              {d.entrega === "domicilio" && <div className="flex justify-between"><dt>Domicilio</dt><dd>{formatoCOP(costoEnvio(menu, d))}</dd></div>}
              <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{formatoCOP(total)}</dd></div>
            </dl>
            <Err m={errores.minimo} />
            <button onClick={enviar} className="mt-4 min-h-12 w-full rounded-xl bg-ok font-semibold text-white">Enviar pedido por WhatsApp</button>
            <p className="mt-2 text-xs opacity-60">Usamos tu nombre, celular y dirección solo para este pedido (Ley 1581 de 2012).</p>
          </>
        )}
      </div>
    </div>
  );
}

const Err = ({ m }: { m?: string }) => (m ? <p role="alert" className="text-sm font-normal text-marca">{m}</p> : null);
