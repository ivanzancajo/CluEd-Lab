import { describe, expect, it } from '@jest/globals';
import { TipoElemento } from '@prisma/client';
import { countCollectionsByKind, loadSkinConfiguration } from '../src/lib/skinConfigs.js';

describe('skinConfigs con datos heredados', () => {
  it('ignora descripciones sin elemento relacionado al contar colecciones', () => {
    const counts = countCollectionsByKind([
      { element: { kind: TipoElemento.SUJETO } },
      { element: { kind: TipoElemento.OBJETO } },
      { element: null },
      {},
    ]);

    expect(counts).toEqual({ subjects: 1, objects: 1, spaces: 0 });
  });

  it('omite descripciones huerfanas al cargar una skin completa', async () => {
    const client = {
      cluedoSkin: {
        findUnique: async () => ({
          id: 'skin-1',
          name: 'Skin heredada',
          objective: 'Objetivo',
          context: null,
          imageUrl: null,
          elementDescriptions: [
            {
              skinId: 'skin-1',
              elementId: 'elem-1',
              description: 'Sujeto valido',
              motif: null,
            },
            {
              skinId: 'skin-1',
              elementId: 'elem-huerfano',
              description: 'Registro roto',
              motif: null,
            },
          ],
        }),
      },
      elemento: {
        findMany: async () => [
          {
            id: 'elem-1',
            name: 'Ada',
            kind: TipoElemento.SUJETO,
            imageUrl: null,
          },
        ],
      },
    };

    const loaded = await loadSkinConfiguration(client as never, 'skin-1');

    expect(loaded.subjects).toEqual([
      {
        id: 'elem-1',
        name: 'Ada',
        desc: 'Sujeto valido',
        imageUrl: undefined,
        motif: undefined,
      },
    ]);
    expect(loaded.objects).toEqual([]);
    expect(loaded.spaces).toEqual([]);
  });
});