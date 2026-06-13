import { config as loadDotenv } from 'dotenv';
import { TipoElemento } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

loadDotenv({ override: true, quiet: true });

// SVG inline como data URI — no depende de URLs externas
const CENTER_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">' +
    '<rect width="160" height="160" rx="24" fill="#0f172a"/>' +
    '<circle cx="80" cy="80" r="52" fill="none" stroke="#7c3aed" stroke-width="3" opacity="0.6"/>' +
    '<circle cx="80" cy="80" r="36" fill="#1e1b4b"/>' +
    '<text x="80" y="87" font-family="monospace" font-size="22" font-weight="bold" ' +
    'fill="#a78bfa" text-anchor="middle">?</text>' +
    '<text x="80" y="140" font-family="monospace" font-size="9" fill="#6d28d9" text-anchor="middle">CLUEDO</text>' +
    '</svg>'
  );

type CreateItem = {
  name: string;
  desc: string;
  imageUrl?: string;
  motif?: string;
};

function buildSujetos(): CreateItem[] {
  return [
    { name: 'Dr. Ada Lovelace',    desc: 'Pionera de la programacion. Calcula cada movimiento.', imageUrl: '' },
    { name: 'Prof. Alan Turing',   desc: 'Descifrador de enigmas. Nadie conoce sus intenciones.', imageUrl: '' },
    { name: 'Ing. Hedy Lamarr',    desc: 'Inventora del espectro ensanchado. Siempre un paso adelante.', imageUrl: '' },
    { name: 'Dr. Claude Shannon',  desc: 'Padre de la teoria de la informacion. Guarda secretos en bits.', imageUrl: '' },
    { name: 'Dra. Grace Hopper',   desc: 'Depuradora de maquinas. Encontro el primer bug real.', imageUrl: '' },
    { name: 'Prof. Norbert Wiener', desc: 'Cibernetico. Controla los sistemas desde las sombras.', imageUrl: '' },
  ];
}

function buildObjetos(): CreateItem[] {
  return [
    { name: 'Cable de fibra',      desc: 'Puede interrumpir cualquier comunicacion optica.', imageUrl: '' },
    { name: 'Soldador de estano',  desc: 'Deja marcas imperceptibles en los circuitos.', imageUrl: '' },
    { name: 'Osciloscopio',        desc: 'Registra senales que nadie mas puede ver.', imageUrl: '' },
    { name: 'Llave inglesa',       desc: 'Abre o cierra cualquier panel del laboratorio.', imageUrl: '' },
    { name: 'Laptop cifrado',      desc: 'Contiene datos comprometedores encriptados.', imageUrl: '' },
    { name: 'Disolvente quimico',  desc: 'Borra huellas en placas de circuito impreso.', imageUrl: '' },
  ];
}

function buildEspacios(): CreateItem[] {
  return [
    {
      name: 'Camara Anecoica',
      desc: 'Sala de absorcion total de ondas electromagneticas. Sin ecos, sin testigos.',
      motif: 'Sello de seguridad roto',
      imageUrl: '',
    },
    {
      name: 'Sala Hedy Lamarr',
      desc: 'Dedicada a la pionera de las comunicaciones inalambricas. Equipada con antenas de ultima generacion.',
      motif: 'Interferencia en la frecuencia',
      imageUrl: '',
    },
    {
      name: 'Central de Conmutacion',
      desc: 'Nucleo de la red de telecomunicaciones del edificio. Acceso restringido.',
      motif: 'Registro de acceso alterado',
      imageUrl: '',
    },
    {
      name: 'Seminario Haykin',
      desc: 'Sala de teoria de senales y sistemas. Pizarras llenas de ecuaciones borradas.',
      motif: 'Cinta de grabacion cortada',
      imageUrl: '',
    },
    {
      name: 'Club de Radio',
      desc: 'Espacio de radioaficionados con equipos de alta potencia. Transmisiones no autorizadas detectadas.',
      motif: 'Frecuencia bloqueada',
      imageUrl: '',
    },
    {
      name: 'Lab. Comunicaciones Opticas',
      desc: 'Laboratorio de fibra optica y laser. El haz principal aparece desviado.',
      motif: 'Haz laser desviado',
      imageUrl: '',
    },
    {
      name: 'Seminario Torres Quevedo',
      desc: 'Homenaje al inventor del dirigible y el ajedrez mecanico. Armario con llave forzada.',
      motif: 'Cerradura forzada',
      imageUrl: '',
    },
    {
      name: 'Lab. Electronica y Electricidad',
      desc: 'Laboratorio de circuitos y sistemas de potencia. Panel de distribución abierto.',
      motif: 'Panel electrico abierto',
      imageUrl: '',
    },
    {
      name: 'Seminario Maxwell',
      desc: 'Sala de electromagnetismo dedicada a James Clerk Maxwell. Nota manuscrita encontrada.',
      motif: 'Nota de despedida anonima',
      imageUrl: '',
    },
  ];
}

async function createCollectionItems(skinId: string, kind: TipoElemento, items: CreateItem[]) {
  for (const item of items) {
    const element = await prisma.elemento.create({
      data: {
        name: item.name,
        kind,
        imageUrl: item.imageUrl || null,
      },
    });

    await prisma.descripcionElemento.create({
      data: {
        skinId,
        elementId: element.id,
        description: item.desc,
        motif: kind === TipoElemento.ESPACIO ? (item.motif ?? null) : null,
      },
    });
  }
}

async function main() {
  const skinName = process.env.SKIN_NAME?.trim() || 'Muerte de una ingenia — Demo motivos';
  const timestamp = Date.now();

  console.error(`Creando skin: "${skinName}"...`);

  const skin = await prisma.cluEdSkin.create({
    data: {
      name: skinName,
      objective: 'Alguien ha saboteado el sistema de comunicaciones del laboratorio. Descubre quien, con que y donde.',
      imageUrl: CENTER_IMAGE,
      context: JSON.stringify({
        version: 1,
        gameTitle: 'Muerte de una ingenia',
        duration: '60',
        cat1Name: 'Sospechosos',
        cat2Name: 'Instrumentos',
        cat3Name: 'Espacios',
        hasMotifs: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    },
  });

  await createCollectionItems(skin.id, TipoElemento.SUJETO, buildSujetos());
  await createCollectionItems(skin.id, TipoElemento.OBJETO, buildObjetos());
  await createCollectionItems(skin.id, TipoElemento.ESPACIO, buildEspacios());

  console.error(`Skin creada correctamente.`);
  process.stdout.write(
    JSON.stringify({ skinId: skin.id, skinName }, null, 2)
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
