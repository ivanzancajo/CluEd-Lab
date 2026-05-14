import { config as loadDotenv } from 'dotenv';
import { TipoElemento } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

loadDotenv({ override: true, quiet: true });

type CreateItem = {
  name: string;
  desc: string;
  imageUrl: string;
  motif?: string;
};

function buildItems(prefix: string, count: number): CreateItem[] {
  return Array.from({ length: count }, (_value, index) => {
    const itemNumber = index + 1;
    const slug = `${prefix.toLocaleLowerCase('es')}-${itemNumber}`;

    return {
      name: `${prefix} ${itemNumber}`,
      desc: `Descripcion de ${prefix} ${itemNumber}`,
      imageUrl: `https://example.com/${slug}.png`,
    };
  });
}

function buildSpaces(): CreateItem[] {
  return [
    { name: 'Camara Anecoica', desc: 'Espacio 1', imageUrl: 'https://example.com/espacio-1.png' },
    { name: 'Sala Hedy Lamarr', desc: 'Espacio 2', imageUrl: 'https://example.com/espacio-2.png' },
    { name: 'Central de Conmutacion', desc: 'Espacio 3', imageUrl: 'https://example.com/espacio-3.png' },
    { name: 'Seminario Haykin', desc: 'Espacio 4', imageUrl: 'https://example.com/espacio-4.png' },
    { name: 'Club de radio', desc: 'Espacio 5', imageUrl: 'https://example.com/espacio-5.png' },
    {
      name: 'Laboratorio de Comunicaciones Opticas',
      desc: 'Espacio 6',
      imageUrl: 'https://example.com/espacio-6.png',
    },
    {
      name: 'Lab. Electronica y Electricidad',
      desc: 'Espacio 7',
      imageUrl: 'https://example.com/espacio-7.png',
    },
    { name: 'Seminario Maxwell', desc: 'Espacio 8', imageUrl: 'https://example.com/espacio-8.png' },
    {
      name: 'Seminario Torres Quevedo',
      desc: 'Espacio 9',
      imageUrl: 'https://example.com/espacio-9.png',
    },
  ];
}

async function createCollectionItems(skinId: string, kind: TipoElemento, items: CreateItem[]) {
  for (const item of items) {
    const element = await prisma.elemento.create({
      data: {
        name: item.name,
        kind,
        imageUrl: item.imageUrl,
      },
    });

    await prisma.descripcionElemento.create({
      data: {
        skinId,
        elementId: element.id,
        description: item.desc,
        motif: kind === TipoElemento.ESPACIO ? item.motif ?? null : null,
      },
    });
  }
}

async function main() {
  const skinName = process.env.SKIN_NAME?.trim() || `e2e-skin-${Date.now()}`;
  const timestamp = Date.now();

  const skin = await prisma.cluedoSkin.create({
    data: {
      name: skinName,
      objective: 'Validar sugerencia, refutacion y cierre de turno desde el terminal.',
      imageUrl: '',
      context: JSON.stringify({
        version: 1,
        gameTitle: 'Deduccion realtime',
        duration: '45',
        cat1Name: 'Sujetos',
        cat2Name: 'Objetos',
        cat3Name: 'Espacios',
        hasMotifs: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    },
  });

  await createCollectionItems(skin.id, TipoElemento.SUJETO, buildItems('Sujeto', 6));
  await createCollectionItems(skin.id, TipoElemento.OBJETO, buildItems('Objeto', 6));
  await createCollectionItems(skin.id, TipoElemento.ESPACIO, buildSpaces());

  process.stdout.write(
    JSON.stringify({
      skinId: skin.id,
      skinName,
    })
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
