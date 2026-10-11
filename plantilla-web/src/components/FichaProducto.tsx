import { useState } from "react";
import { X } from "lucide-react";
import { formatoCOP, precioUnitario, problemaSeleccion } from "../lib/pedido";
import type { Linea, Producto, Seleccion } from "../lib/tipos";

type Props = { producto: Producto; onAgregar: (l: Omit<Linea, "key">) => void; onCerrar: () => void };

export function FichaProducto({ producto, onAgregar, onCerrar }: Props) {
  const [sel, setSel] = useState<Seleccion>({});
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  const problema = problemaSeleccion(producto, sel);

  function alternar(gid: string, oid: string, max: number) {
    setSel((s) => {
      const actual = s[gid] ?? [];
      if (actual.includes(oid)) return { ...s, [gid]: actual.filter((x) => x !== oid) };
      return { ...s, [gid]: max === 1 ? [oid] : actual.length < max ? [...actual, oid] : actual };
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/50 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={producto.nombre}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[var(--radius-caja)] bg-fondo p-5 sm:max-w-lg sm:rounded-[var(--radius-caja)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl">{producto.nombre}</h2>
            <p className="text-sm opacity-70">{producto.descripcion}</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="grid w-11 place-items-center rounded-full"><X /></button>
        </div>

        {producto.grupos?.map((g) => (
          <fieldset key={g.id} className="mt-5">
            <legend className="font-semibold">
              {g.nombre} <span className="text-xs font-normal opacity-60">{g.min > 0 ? "obligatorio" : "opcional"}{g.incluidas ? ` · ${g.incluidas} incluidas` : ""}</span>
            </legend>
            {g.opciones.map((o) => {
              const marcada = (sel[g.id] ?? []).includes(o.id);
              return (
                <label key={o.id} className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-2 border-tinta/15 px-3 has-[:checked]:border-marca">
                  <input type={g.max === 1 ? "radio" : "checkbox"} name={g.id} checked={marcada} onChange={() => alternar(g.id, o.id, g.max)} className="accent-marca" />
                  <span className="flex-1">{o.nombre}</span>
                  {o.precio > 0 && <span className="text-sm opacity-70">+ {formatoCOP(o.precio)}</span>}
                </label>
              );
            })}
          </fieldset>
        ))}

        <label className="mt-5 block font-semibold">Nota
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: sin cebolla" className="mt-1 w-full rounded-xl border-2 border-tinta/15 px-3 font-normal" />
        </label>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center rounded-xl border-2 border-tinta/15">
            <button onClick={() => setCantidad((c) => Math.max(1, c - 1))} aria-label="Menos" className="w-11">−</button>
            <span className="w-8 text-center" aria-live="polite">{cantidad}</span>
            <button onClick={() => setCantidad((c) => c + 1)} aria-label="Más" className="w-11">+</button>
          </div>
          <button
            disabled={!!problema}
            onClick={() => { onAgregar({ productoId: producto.id, seleccion: sel, cantidad, nota }); onCerrar(); }}
            className="min-h-12 flex-1 rounded-xl bg-marca px-4 font-semibold text-white disabled:bg-tinta/20 disabled:text-tinta/60"
          >
            {problema ?? `Agregar · ${formatoCOP(precioUnitario(producto, sel) * cantidad)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
