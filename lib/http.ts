/**
 * CSRF: browsers enviam Origin em POST/DELETE; a origem precisa bater com o host da requisição.
 * Compara com o header Host (não com req.url, que o Next normaliza e pode trocar 127.0.0.1 por localhost).
 */
export function badOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("host");
  if (!host) return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
