import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

type LoginResponse = {
  token: string;
};

type SkinDetailResponse = {
  item: {
    id: string;
    name: string;
    gameTitle: string;
    objective: string;
    duration: string;
    centerImage: string;
    cat1Name: string;
    cat2Name: string;
    cat3Name: string;
    hasMotifs: boolean;
    subjects: Array<{ name: string }>;
    objects: Array<{ name: string }>;
    spaces: Array<{ name: string }>;
  };
};

type CreateItem = {
  name: string;
  desc: string;
  imageUrl: string;
};

const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'cluedo2026';
const DEFAULT_BACKEND_PORT = 4400;

const currentFilePath = fileURLToPath(import.meta.url);
const testsDirectory = path.dirname(currentFilePath);
const backendDirectory = path.resolve(testsDirectory, '..');
const repositoryRoot = path.resolve(backendDirectory, '..');
const composeFilePath = path.join(repositoryRoot, 'docker-compose.backend-postgres.integration.yml');

async function main() {
  ensureDockerIsAvailable();

  const backendPort = await findAvailablePort(DEFAULT_BACKEND_PORT);
  const baseUrl = `http://127.0.0.1:${backendPort}`;
  const projectName = `scrum37-${Date.now().toString(36)}-${process.pid}`;
  const composeEnv = {
    ...process.env,
    BACKEND_SMOKE_TEST_PORT: String(backendPort),
  };

  console.log(`Iniciando smoke test SCRUM-37 en ${baseUrl} con proyecto ${projectName}.`);

  try {
    runCompose(projectName, composeEnv, ['build', 'backend-migrate', 'backend']);
    runCompose(projectName, composeEnv, ['up', '-d', 'postgres']);
    runCompose(projectName, composeEnv, ['run', '--rm', 'backend-migrate']);
    runCompose(projectName, composeEnv, ['up', '-d', 'backend']);

    await waitForBackend(baseUrl);

    const initialToken = await login(baseUrl);
    const createdSkin = await createSkin(baseUrl, initialToken);

    runCompose(projectName, composeEnv, ['restart', 'backend']);
    await waitForBackend(baseUrl);

    const tokenAfterRestart = await login(baseUrl);
    const persistedSkin = await getSkin(baseUrl, tokenAfterRestart, createdSkin.id);

    assert.equal(persistedSkin.item.id, createdSkin.id, 'El identificador persistido no coincide.');
    assert.equal(persistedSkin.item.name, createdSkin.name, 'El nombre persistido no coincide.');
    assert.equal(persistedSkin.item.gameTitle, 'Laboratorio Forense');
    assert.equal(persistedSkin.item.subjects.length, 6);
    assert.equal(persistedSkin.item.objects.length, 6);
    assert.equal(persistedSkin.item.spaces.length, 9);

    console.log('SCRUM-37 OK: el backend en contenedor persiste y recupera datos desde PostgreSQL tras reinicio.');
  } catch (error) {
    printComposeLogs(projectName, composeEnv);
    throw error;
  } finally {
    try {
      runCompose(projectName, composeEnv, ['down', '-v', '--remove-orphans']);
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      console.error(`No se pudo limpiar el entorno Docker de SCRUM-37: ${cleanupMessage}`);
    }
  }
}

function ensureDockerIsAvailable() {
  runCommand('docker', ['version', '--format', '{{.Server.Version}}'], repositoryRoot, process.env);
}

function runCompose(projectName: string, env: NodeJS.ProcessEnv, args: string[]) {
  return runCommand(
    'docker',
    ['compose', '-p', projectName, '-f', composeFilePath, ...args],
    repositoryRoot,
    env
  );
}

function runCommand(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  try {
    return execFileSync(command, args, {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim()
        : '';
    const stdout =
      typeof error === 'object' && error !== null && 'stdout' in error && typeof error.stdout === 'string'
        ? error.stdout.trim()
        : '';
    const details = [stderr, stdout].filter(Boolean).join('\n');

    throw new Error(
      [`Falló el comando: ${command} ${args.join(' ')}`, details].filter(Boolean).join('\n')
    );
  }
}

function printComposeLogs(projectName: string, env: NodeJS.ProcessEnv) {
  try {
    const logs = runCompose(projectName, env, ['logs', '--no-color', 'postgres', 'backend', 'backend-migrate']);
    if (logs) {
      console.error(logs);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`No se pudieron recuperar los logs de Docker Compose: ${message}`);
  }
}

async function findAvailablePort(preferredPort: number) {
  if (await isPortAvailable(preferredPort)) {
    return preferredPort;
  }

  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('No se pudo asignar un puerto para el smoke test de SCRUM-37.'));
        return;
      }

      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(port);
      });
    });

    server.on('error', reject);
  });
}

function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });
}

async function waitForBackend(baseUrl: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'El backend todavía no ha respondido.';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }

      lastError = `Healthcheck devolvió ${response.status}.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(1_000);
  }

  throw new Error(`El backend no estuvo listo a tiempo. Último error: ${lastError}`);
}

async function login(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    }),
  });

  assert.equal(response.status, 200, `El login del administrador falló con ${response.status}.`);
  const body = (await response.json()) as Partial<LoginResponse>;
  assert.equal(typeof body.token, 'string', 'La respuesta de login no incluyó un token JWT.');

  return body.token;
}

async function createSkin(baseUrl: string, token: string) {
  const payload = buildCreatePayload(`Skin Docker ${Date.now()}`);
  const response = await fetch(`${baseUrl}/api/config/skins`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  assert.equal(response.status, 201, `La creación de la skin falló con ${response.status}.`);

  const body = (await response.json()) as SkinDetailResponse;
  assert.equal(body.item.name, payload.name);
  assert.equal(body.item.subjects.length, 6);
  assert.equal(body.item.objects.length, 6);
  assert.equal(body.item.spaces.length, 9);

  return {
    id: body.item.id,
    name: payload.name,
  };
}

async function getSkin(baseUrl: string, token: string, skinId: string) {
  const response = await fetch(`${baseUrl}/api/config/skins/${skinId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  assert.equal(response.status, 200, `La recuperación de la skin persistida falló con ${response.status}.`);
  return (await response.json()) as SkinDetailResponse;
}

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

function buildCreatePayload(name: string) {
  return {
    name,
    gameTitle: 'Laboratorio Forense',
    objective: 'Analizar relaciones entre sujetos, objetos y espacios.',
    duration: 75,
    centerImage: 'https://example.com/skin-centro.png',
    cat1Name: 'Sujetos',
    cat2Name: 'Objetos',
    cat3Name: 'Espacios',
    hasMotifs: false,
    subjects: buildItems('Sujeto', 6),
    objects: buildItems('Objeto', 6),
    spaces: buildItems('Espacio', 9),
  };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
