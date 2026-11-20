import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Las rutas con `lazy` importan módulos antes de renderizar: con la suite en paralelo
// eso puede superar el segundo por defecto de findBy*/waitFor.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
});
