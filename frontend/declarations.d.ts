/// <reference types="vite/client" />

// Permite que TypeScript reconozca importaciones de imágenes PNG
declare module "*.png" {
  const value: string;
  export default value;
}

// Permite el protocolo específico de los assets de Figma
declare module "figma:asset/*" {
  const value: string;
  export default value;
}