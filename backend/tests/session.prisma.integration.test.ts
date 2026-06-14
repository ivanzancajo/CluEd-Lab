import { EstadoPartida, PrismaClient } from '@prisma/client';
import { loadSessionSnapshotByAccessCode, loadSessionSnapshotById } from '../src/lib/sessionSnapshots.js';
import { getTestDatabaseUrl } from './helpers/testDatabase';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getTestDatabaseUrl(),
    },
  },
});

describe('SCRUM-27 Prisma integration de sesiones', () => {
  beforeEach(async () => {
    await prisma.partida.deleteMany();
    await prisma.cluEdSkin.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crea y recupera una sesion persistida en la base de datos de prueba', async () => {
    const metadata = {
      version: 1,
      gameTitle: 'Test Lab Creator',
      duration: '45',
      cat1Name: 'Sujetos',
      cat2Name: 'Objetos',
      cat3Name: 'Espacios',
      hasMotifs: false,
      createdAt: 1713657600000,
      updatedAt: 1713657600000,
    };

    const skin = await prisma.cluEdSkin.create({
      data: {
        name: 'Skin de integración',
        objective: 'Validar persistencia de sesiones.',
        context: JSON.stringify(metadata),
        imageUrl: 'https://example.com/center-image.png',
      },
    });

    const createdSession = await prisma.partida.create({
      data: {
        accessCode: 'ABC123',
        status: EstadoPartida.LOBBY,
        skinId: skin.id,
        durationMinutes: 45,
      },
    });

    const snapshotByCode = await loadSessionSnapshotByAccessCode(prisma, createdSession.accessCode);
    const snapshotById = await loadSessionSnapshotById(prisma, createdSession.id);

    expect(snapshotByCode).toMatchObject({
      id: createdSession.id,
      accessCode: 'ABC123',
      status: EstadoPartida.LOBBY,
      durationSeconds: 2700,
      remainingSeconds: 2700,
      teams: [],
      skin: {
        id: skin.id,
        name: 'Skin de integración',
        gameTitle: 'Test Lab Creator',
        objective: 'Validar persistencia de sesiones.',
        duration: '45',
        centerImage: 'https://example.com/center-image.png',
        cat1Name: 'Sujetos',
        cat2Name: 'Objetos',
        cat3Name: 'Espacios',
        hasMotifs: false,
      },
    });

    expect(snapshotById).toEqual(snapshotByCode);
  });
});