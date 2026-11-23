import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR como SVG (no necesita canvas). `texto` es la URL de ARCA que arma la BD (RG 4892). */
export function CodigoQr({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    QRCode.toString(texto, { type: "svg", errorCorrectionLevel: "M", margin: 1 })
      .then((resultado) => {
        if (vigente) setSvg(resultado);
      })
      .catch(() => {
        if (vigente) setFallo(true);
      });
    return () => {
      vigente = false;
    };
  }, [texto]);

  if (fallo) {
    return (
      <a href={texto} className="text-sm underline" target="_blank" rel="noreferrer">
        Verificar en ARCA
      </a>
    );
  }
  if (!svg) return <div className="size-32" aria-hidden />;
  return (
    <img
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      alt={etiqueta}
      className="size-32"
    />
  );
}
