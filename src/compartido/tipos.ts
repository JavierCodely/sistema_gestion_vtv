import type { Database } from "@/types/database";

/** Tipos de dominio derivados del esquema generado de la BD (npm run db:types). */
export type Tablas = Database["public"]["Tables"];
export type Enums = Database["public"]["Enums"];

export type Rol = Enums["rol_usuario"];
export type Perfil = Tablas["perfiles"]["Row"];
