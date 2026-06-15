// Comprime y redimensiona una imagen en el cliente antes de serializarla como
// data URL base64. Las imágenes de las skins se guardan como base64 dentro del
// JSON de /api/config/skins; sin comprimir, una foto de móvil (varios MB) supera
// el límite por imagen del backend (5.000.000 caracteres) y/o el límite de cuerpo
// (25 MB) al sumar los 21 elementos del tablero, y el guardado falla entero.
// Reduciendo cada imagen a un lado máximo y recodificándola a JPEG/WebP, cada una
// queda en decenas de KB, muy por debajo de los límites.

export type CompressImageOptions = {
  /** Lado máximo (px) del lado más largo de la imagen resultante. */
  maxSize?: number;
  /** Calidad de compresión (0-1) para formatos con pérdida. */
  quality?: number;
  /** Tipo MIME de salida. */
  mimeType?: "image/jpeg" | "image/webp";
};

const DEFAULT_OPTIONS: Required<CompressImageOptions> = {
  maxSize: 512,
  quality: 0.8,
  mimeType: "image/jpeg",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo decodificar la imagen."));
    image.src = src;
  });
}

/**
 * Lee un `File` de imagen, lo redimensiona manteniendo proporción para que su
 * lado más largo no supere `maxSize`, y lo recodifica como data URL comprimido.
 * Si algo falla (formato no rasterizable como SVG, canvas no disponible, etc.)
 * cae al data URL original sin comprimir para no bloquear al usuario.
 */
export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {}
): Promise<string> {
  const { maxSize, quality, mimeType } = { ...DEFAULT_OPTIONS, ...options };

  const originalDataUrl = await readFileAsDataUrl(file);
  if (!originalDataUrl) {
    return "";
  }

  try {
    const image = await loadImage(originalDataUrl);
    const { width, height } = image;
    if (!width || !height) {
      return originalDataUrl;
    }

    const scale = Math.min(1, maxSize / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return originalDataUrl;
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const compressed = canvas.toDataURL(mimeType, quality);

    // Si por lo que sea la versión "comprimida" es mayor (p.ej. un PNG pequeño),
    // conserva la más ligera de las dos.
    return compressed.length < originalDataUrl.length ? compressed : originalDataUrl;
  } catch {
    return originalDataUrl;
  }
}
