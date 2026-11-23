/**
 * Portada del admin sin la librería de gráficos, para los tests de login, rutas y layout que pasan
 * por `/admin` sin probar el dashboard: la primera carga de Recharts con la suite en paralelo supera
 * la espera de los `findBy*`. El dashboard real se prueba en `tests/unit/modulos/dashboard/`.
 *
 * Uso: `vi.mock("@/modulos/dashboard/paginas/Dashboard", () => import("@tests/soporte/dashboard-liviano"));`
 */
export function Dashboard() {
  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}
