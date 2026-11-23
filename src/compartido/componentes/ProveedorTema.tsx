import { useEffect, useState, type ReactNode } from "react";
import {
  CLAVE_TEMA,
  CONSULTA_OSCURO,
  ContextoDeTema,
  type Preferencia,
  type Tema,
} from "@/compartido/lib/tema";

function leerPreferencia(): Preferencia {
  try {
    const guardada = localStorage.getItem(CLAVE_TEMA);
    return guardada === "light" || guardada === "dark" ? guardada : "system";
  } catch {
    return "system";
  }
}

function temaDelSistema(): Tema {
  return window.matchMedia(CONSULTA_OSCURO).matches ? "dark" : "light";
}

export function ProveedorTema({ children }: { children: ReactNode }) {
  const [preferencia, setPreferencia] = useState<Preferencia>(leerPreferencia);
  const [sistema, setSistema] = useState<Tema>(temaDelSistema);
  const tema = preferencia === "system" ? sistema : preferencia;

  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_OSCURO);
    const alCambiar = () => {
      setSistema(consulta.matches ? "dark" : "light");
    };
    consulta.addEventListener("change", alCambiar);
    return () => {
      consulta.removeEventListener("change", alCambiar);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "dark");
    document.documentElement.style.colorScheme = tema;
  }, [tema]);

  function cambiarTema(nuevo: Tema) {
    setPreferencia(nuevo);
    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // Sin almacenamiento (modo privado): el cambio vale para esta sesión.
    }
  }

  return (
    <ContextoDeTema.Provider value={{ tema, cambiarTema }}>{children}</ContextoDeTema.Provider>
  );
}
