import type { Rol } from "@/compartido/tipos";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";

export function SelectorRol({
  id,
  valor,
  onCambio,
  deshabilitado,
}: {
  id: string;
  valor: Rol;
  onCambio: (rol: Rol) => void;
  deshabilitado?: boolean;
}) {
  return (
    <Select
      value={valor}
      disabled={deshabilitado ?? false}
      onValueChange={(v) => {
        onCambio(v === "admin" ? "admin" : "cajero");
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="cajero">Cajero</SelectItem>
        <SelectItem value="admin">Administrador</SelectItem>
      </SelectContent>
    </Select>
  );
}
