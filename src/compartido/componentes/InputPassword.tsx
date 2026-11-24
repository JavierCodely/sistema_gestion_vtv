import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cn } from "@/compartido/lib/utils";
import { Input } from "@/compartido/ui/input";

/**
 * Campo de contraseña con el botón "ver contraseña" (ojo). El botón es `type="button"` (no envía el
 * formulario) y anuncia su estado con `aria-pressed`. Al mostrarla, el campo pasa a texto plano.
 */
export function InputPassword({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => {
          setVisible((actual) => !actual);
        }}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
