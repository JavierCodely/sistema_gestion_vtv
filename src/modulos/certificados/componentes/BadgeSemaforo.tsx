import { Badge } from "@/compartido/ui/badge";
import type { CertificadoConStock } from "../api/consultas";

const ESTADOS: Record<
  CertificadoConStock["semaforo"],
  { texto: string; variante: "secondary" | "outline" | "destructive" }
> = {
  ok: { texto: "OK", variante: "secondary" },
  bajo: { texto: "Stock bajo", variante: "outline" },
  sin_stock: { texto: "Sin stock", variante: "destructive" },
};

export function BadgeSemaforo({ semaforo }: { semaforo: CertificadoConStock["semaforo"] }) {
  const { texto, variante } = ESTADOS[semaforo];
  return <Badge variant={variante}>{texto}</Badge>;
}
