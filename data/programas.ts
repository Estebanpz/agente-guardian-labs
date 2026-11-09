// Catálogo de facultades y programas (plan PLAN_IDENTIDAD_SALUDO.md, sección 1).
// Fuente: páginas de facultad de uniespinal.edu.co, consultadas el 2026-11-08 (dominio oficial; las rutas
// exactas de cada página no están en el plan). Datos reales de programas; las personas de la semilla son ficticias.

export type Nivel = "técnico" | "tecnólogo" | "profesional";

export type Programa = { nombre: string; nivel: Nivel };

export type Facultad = { id: string; nombre: string; programas: Programa[] };

export const FACULTADES: Facultad[] = [
  {
    id: "ingenieria",
    nombre: "Facultad de Ingeniería y Ciencias Agroindustriales",
    programas: [
      { nombre: "Técnica Profesional en Programación Web", nivel: "técnico" },
      { nombre: "Mantenimiento Electrónico", nivel: "técnico" },
      { nombre: "Construcción de Edificaciones", nivel: "técnico" },
      { nombre: "Monitoreo Agrícola", nivel: "técnico" },
      { nombre: "Técnica Profesional en Monitoreo Ambiental", nivel: "técnico" },
      { nombre: "Gestión Informática", nivel: "tecnólogo" },
      { nombre: "Automatización Electrónica Industrial por Ciclos Propedéuticos", nivel: "tecnólogo" },
      { nombre: "Gestión de la Construcción", nivel: "tecnólogo" },
      { nombre: "Producción de Agrocultivos", nivel: "tecnólogo" },
      { nombre: "Tecnología en Gestión Ambiental", nivel: "tecnólogo" },
      { nombre: "Ingeniería de Sistemas", nivel: "profesional" },
      { nombre: "Ingeniería Electrónica", nivel: "profesional" },
      { nombre: "Ingeniería Civil", nivel: "profesional" },
      { nombre: "Ingeniería Agronómica", nivel: "profesional" },
      { nombre: "Ingeniería Ambiental", nivel: "profesional" },
    ],
  },
  {
    id: "economicas",
    nombre: "Facultad de Ciencias Económicas, Administrativas y Jurídicas",
    programas: [
      { nombre: "Procesos Administrativos", nivel: "técnico" },
      { nombre: "Procesos Contables", nivel: "técnico" },
      { nombre: "Gestión Empresarial", nivel: "tecnólogo" },
      { nombre: "Gestión Contable y Financiera", nivel: "tecnólogo" },
      { nombre: "Administración de Empresas", nivel: "profesional" },
      { nombre: "Contaduría Pública", nivel: "profesional" },
    ],
  },
  {
    id: "sociales",
    nombre: "Facultad de Ciencias Sociales, Salud y Educación",
    programas: [
      { nombre: "Operación de Servicios Comunitarios", nivel: "técnico" },
      { nombre: "Entrenamiento Deportivo", nivel: "técnico" },
      { nombre: "Gestión Deportiva", nivel: "tecnólogo" },
      { nombre: "Gestión Comunitaria", nivel: "tecnólogo" },
      { nombre: "Trabajo Social", nivel: "profesional" },
      { nombre: "Actividad Física y Deporte", nivel: "profesional" },
    ],
  },
];

// Nombre completo de la facultad a partir de su id.
export const facultadPorId = (id: string): Facultad | undefined => FACULTADES.find((f) => f.id === id);
