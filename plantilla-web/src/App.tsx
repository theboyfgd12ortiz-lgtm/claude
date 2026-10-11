import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import menuData from "./data/menu.json";
import { Checkout } from "./components/Checkout";
import { FichaProducto } from "./components/FichaProducto";
import { estaAbierto, formatoCOP, subtotal } from "./lib/pedido";
import type { Menu, Producto } from "./lib/tipos";
import { useCarrito } from "./lib/useCarrito";

const menu = menuData as Menu;

export default function App() {
  const { lineas, agregar, cambiarCantidad, vaciar } = useCarrito();
  const [producto, setProducto] = useState<Producto | null>(null);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const abierto = estaAbierto(menu.negocio.horario);
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-marca px-4 py-3 text-white">
        <div>
          <h1 className="text-xl leading-tight">{menu.negocio.nombre}</h1>
          <p className="text-sm">{abierto ? "🟢 Abierto ahora" : "🔴 Cerrado ahora"} · {menu.negocio.ciudad}</p>
        </div>
        <button onClick={() => setCarritoAbierto(true)} aria-label={`Pedido: ${unidades} productos`} className="relative grid w-11 place-items-center">
          <ShoppingBag />
          {unidades > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-acento text-xs font-bold text-tinta">{unidades}</span>}
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-28">
        <section className="py-8">
          <h2 className="text-4xl sm:text-5xl">{menu.negocio.eslogan}</h2>
          {!abierto && <p className="mt-2 rounded-xl bg-acento p-3 font-semibold">Ahora estamos cerrados. Puedes ver el menú, pero no enviar pedidos.</p>}
        </section>

        <nav aria-label="Categorías" className="sticky top-[68px] z-10 -mx-4 flex gap-2 overflow-x-auto bg-fondo px-4 py-2">
          {menu.categorias.map((c) => <a key={c.id} href={`#${c.id}`} className="grid shrink-0 place-items-center rounded-full border-2 border-tinta px-4 font-semibold">{c.nombre}</a>)}
        </nav>

        {menu.categorias.map((c) => (
          <section key={c.id} id={c.id} className="scroll-mt-32 pt-6">
            <h2 className="text-2xl">{c.nombre}</h2>
            <ul className="mt-3 space-y-3">
              {menu.productos.filter((p) => p.categoria === c.id).map((p) => (
                <li key={p.id}>
                  <button disabled={!p.disponible} onClick={() => setProducto(p)} className="flex w-full items-center gap-3 rounded-[var(--radius-caja)] border-2 border-tinta bg-white p-3 text-left shadow-[4px_4px_0_var(--color-tinta)] disabled:opacity-50 disabled:shadow-none">
                    {p.imagen && <img src={p.imagen} alt={p.nombre} width={80} height={80} loading="lazy" className="size-20 rounded-xl object-cover" />}
                    <span className="flex-1"><strong className="block">{p.nombre}</strong><small className="opacity-70">{p.descripcion}</small></span>
                    <span className="font-bold">{p.disponible ? formatoCOP(p.precio) : "Agotado"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      {unidades > 0 && (
        <button onClick={() => setCarritoAbierto(true)} className="fixed inset-x-4 bottom-4 z-20 mx-auto min-h-12 max-w-md rounded-xl bg-tinta font-semibold text-white shadow-lg">
          Ver pedido · {unidades} · {formatoCOP(subtotal(lineas, menu.productos))}
        </button>
      )}

      {producto && <FichaProducto producto={producto} onAgregar={agregar} onCerrar={() => setProducto(null)} />}
      <Checkout menu={menu} lineas={lineas} abierto={carritoAbierto} onCantidad={cambiarCantidad} onCerrar={() => setCarritoAbierto(false)} onTerminar={() => { vaciar(); setCarritoAbierto(false); }} />
    </>
  );
}
