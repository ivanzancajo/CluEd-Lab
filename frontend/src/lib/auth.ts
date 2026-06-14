const ADMIN_TOKEN_KEY = 'adminToken';

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const withPadding = padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), '=');
  return atob(withPadding);
}

interface JwtPayload {
  exp?: number;
}

export function getStoredAdminToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) {
    return null;
  }

  if (isTokenExpired(token)) {
    clearAdminSession();
    return null;
  }

  return token;
}

export function clearAdminSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

export function storeAdminToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  }
}

export function hasStoredAdminSession(): boolean {
  return getStoredAdminToken() !== null;
}

function isTokenExpired(token: string): boolean {
  try {
    const [, payloadSegment] = token.split('.');
    if (!payloadSegment) {
      return true;
    }

    const payload = JSON.parse(decodeBase64Url(payloadSegment)) as JwtPayload;
    if (!payload.exp) {
      return true;
    }

    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}