export type Opcion = { id: string; nombre: string; precio: number };
export type Grupo = { id: string; nombre: string; min: number; max: number; incluidas?: number; opciones: Opcion[] };
export type Producto = {
  id: string; categoria: string; nombre: string; descripcion: string; precio: number;
  imagen?: string; disponible: boolean; grupos?: Grupo[];
};
/** Día de la semana (0 = domingo … 6 = sábado) → franjas [apertura, cierre]; si cierre <= apertura pasa de medianoche. */
export type Horario = Record<string, string[][]>;
export type Zona = { id: string; nombre: string; costo: number };
export type Negocio = {
  nombre: string; eslogan: string; ciudad: string; whatsapp: string; horario: Horario;
  pedidoMinimo: number; entrega: { domicilio: boolean; recoger: boolean }; zonas: Zona[]; pagos: string[];
};
export type Menu = { negocio: Negocio; categorias: { id: string; nombre: string }[]; productos: Producto[] };

/** grupoId → ids de opciones elegidas */
export type Seleccion = Record<string, string[]>;
export type Linea = { key: string; productoId: string; seleccion: Seleccion; cantidad: number; nota: string };

export type Datos = {
  nombre: string; celular: string; entrega: "domicilio" | "recoger"; zonaId: string;
  direccion: string; pago: string; efectivoCon: string;
};
