import { describe, expect, it } from "vitest";
import menu from "../data/menu.json";
import { celularValido, erroresCheckout, estaAbierto, mensajeWhatsApp, precioUnitario, problemaSeleccion, subtotal, urlWhatsApp } from "./pedido";
import type { Datos, Linea, Menu } from "./tipos";

const m = menu as Menu;
const salchi = m.productos[0];
const datos: Datos = { nombre: "Ana", celular: "3001234567", entrega: "domicilio", zonaId: "centro", direccion: "Cra 1 #2-3", pago: "Nequi", efectivoCon: "" };

describe("precioUnitario", () => {
  it("personal con 2 salsas: salsas incluidas gratis", () => expect(precioUnitario(salchi, { tam: ["p"], salsas: ["rosada", "pina"] })).toBe(15000));
  it("grande con 4 salsas: cobra las 2 extra", () => expect(precioUnitario(salchi, { tam: ["g"], salsas: ["rosada", "pina", "ajo"] })).toBe(22000));
});

describe("problemaSeleccion", () => {
  it("exige el grupo obligatorio", () => expect(problemaSeleccion(salchi, {})).toBe("Elige tamaño"));
  it("rechaza pasarse del máximo", () => expect(problemaSeleccion(salchi, { tam: ["p", "g"] })).toBe("Máximo 1 en tamaño"));
  it("acepta selección válida", () => expect(problemaSeleccion(salchi, { tam: ["p"] })).toBeNull());
});

describe("subtotal y checkout", () => {
  const lineas: Linea[] = [{ key: "a", productoId: "salchi-clasica", seleccion: { tam: ["g"] }, cantidad: 2, nota: "" }];
  it("subtotal = precio × cantidad", () => expect(subtotal(lineas, m.productos)).toBe(42000));
  it("carrito vacío = 0", () => expect(subtotal([], m.productos)).toBe(0));
  it("pedido mínimo", () => expect(erroresCheckout(m, datos, 1000).minimo).toBeDefined());
  it("datos válidos sin errores", () => expect(erroresCheckout(m, datos, 20000)).toEqual({}));
  it("domicilio exige dirección y zona", () => expect(Object.keys(erroresCheckout(m, { ...datos, direccion: "", zonaId: "" }, 20000)).sort()).toEqual(["direccion", "zonaId"]));
  it("celular colombiano", () => { expect(celularValido("3001234567")).toBe(true); expect(celularValido("2001234567")).toBe(false); expect(celularValido("300123")).toBe(false); });
});

describe("estaAbierto (hora de Bogotá = UTC-5)", () => {
  const h = m.negocio.horario;
  it("lunes 17:00 abierto", () => expect(estaAbierto(h, new Date("2026-10-05T22:00:00Z"))).toBe(true));
  it("lunes 10:00 cerrado", () => expect(estaAbierto(h, new Date("2026-10-05T15:00:00Z"))).toBe(false));
  it("domingo cerrado", () => expect(estaAbierto(h, new Date("2026-10-04T20:00:00Z"))).toBe(false));
  it("sábado 01:00 abierto por franja del viernes que pasa de medianoche", () => expect(estaAbierto(h, new Date("2026-10-03T06:00:00Z"))).toBe(true));
});

describe("whatsapp", () => {
  it("lleva código, total y opciones", () => {
    const l: Linea[] = [{ key: "a", productoId: "salchi-clasica", seleccion: { tam: ["g"] }, cantidad: 2, nota: "sin cebolla" }];
    const t = mensajeWhatsApp(m, l, datos, "#A7K2");
    expect(t).toContain("#A7K2");
    expect(t).toContain("Tamaño: Grande");
    expect(t).toContain("sin cebolla");
    expect(t).toMatch(/Total: .*45\.000/);
    expect(urlWhatsApp("573001234567", t)).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);
  });
});
