import { useQuery } from "@tanstack/react-query";
import { InputPassword } from "@/compartido/componentes/InputPassword";
import { CircleAlert } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../contexto";
import { Cargando } from "@/compartido/componentes/Cargando";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/compartido/ui/card";
import { Input } from "@/compartido/ui/input";
import { Label } from "@/compartido/ui/label";
import { mensajeDeError } from "@/compartido/lib/errores";
import { rutaInicio } from "../lib/navegacion";
import { verificarConexion } from "@/compartido/lib/salud";

function destinoPrevio(state: unknown): string | null {
  if (typeof state === "object" && state !== null && "desde" in state) {
    const { desde } = state;
    if (typeof desde === "string" && desde.startsWith("/") && desde !== "/login") return desde;
  }
  return null;
}

export function Login() {
  const { perfil, cargando, aviso, iniciarSesion } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const conexion = useQuery({ queryKey: ["salud"], queryFn: verificarConexion });

  if (perfil) {
    return <Navigate to={destinoPrevio(location.state) ?? rutaInicio(perfil.rol)} replace />;
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!email.trim() || !password) {
      setError("Ingresá tu email y tu contraseña.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await iniciarSesion(email, password);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  const mensaje = error ?? aviso;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">Sistema VTV</h1>
          </CardTitle>
          <CardDescription>Ingresá con tu usuario para empezar.</CardDescription>
        </CardHeader>
        <CardContent>
          {cargando && !enviando ? (
            <Cargando />
          ) : (
            <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
              {mensaje && (
                <Alert variant="destructive">
                  <CircleAlert aria-hidden />
                  <AlertDescription>{mensaje}</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Contraseña</Label>
                <InputPassword
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                  }}
                />
              </div>
              <Button type="submit" disabled={enviando}>
                {enviando ? "Ingresando…" : "Ingresar"}
              </Button>
            </form>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Servidor:{" "}
            <span data-testid="estado-conexion">
              {conexion.isPending ? "verificando…" : conexion.data ? "Conectado" : "Sin conexión"}
            </span>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
