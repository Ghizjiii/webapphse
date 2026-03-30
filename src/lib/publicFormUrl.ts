function normalizeBaseUrl(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  try {
    const normalized = value.includes('://') ? value : `https://${value}`;
    return new URL(normalized).href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function getPublicAppBaseUrl(): string {
  const configuredBaseUrl = normalizeBaseUrl(String(import.meta.env.VITE_PUBLIC_APP_URL || ''));
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return '';
}

export function getPublicFormUrl(token: string | null | undefined): string {
  if (!token) return '';

  const baseUrl = getPublicAppBaseUrl();
  if (!baseUrl) {
    return `/form/${token}`;
  }

  return new URL(`form/${token}`, `${baseUrl}/`).toString();
}
