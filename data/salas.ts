// Salas sintéticas. AJUSTAR nombres y capacidades con la entrevista al responsable.
export type Sala = {
  id: "sala-1" | "sala-2" | "sala-3";
  nombre: string;
  capacidad: number;
  aforo_actual: number;
  franja: string | null;
};

export const salas: Sala[] = [
  { id: "sala-1", nombre: "Sala 1", capacidad: 25, aforo_actual: 10, franja: "08:00–10:00" },
  { id: "sala-2", nombre: "Sala 2", capacidad: 20, aforo_actual: 20, franja: "08:00–10:00" },
  { id: "sala-3", nombre: "Sala 3", capacidad: 15, aforo_actual: 0, franja: null },
];
