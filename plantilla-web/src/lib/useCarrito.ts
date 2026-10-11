import { useEffect, useState } from "react";
import type { Linea } from "./tipos";

const CLAVE = "carrito-v1";

function leer(): Linea[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? "[]"); } catch { return []; }
}

export function useCarrito() {
  const [lineas, setLineas] = useState<Linea[]>(leer);
  useEffect(() => { try { localStorage.setItem(CLAVE, JSON.stringify(lineas)); } catch { /* modo privado: sigue en memoria */ } }, [lineas]);

  return {
    lineas,
    agregar: (l: Omit<Linea, "key">) => setLineas((ls) => [...ls, { ...l, key: crypto.randomUUID() }]),
    cambiarCantidad: (key: string, delta: number) =>
      setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, cantidad: l.cantidad + delta } : l)).filter((l) => l.cantidad > 0)),
    vaciar: () => setLineas([]),
  };
}
