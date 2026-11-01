// Talking to the local studio server.
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface RequestOptions extends RequestInit {
  /** Resolve null for a 404 instead of failing (optional files: a language's copy, a layout map). */
  optional?: boolean;
}

export async function request<T>(
  url: string,
  options: RequestOptions & { optional: true },
): Promise<T | null>;
export async function request<T>(
  url: string,
  options?: RequestOptions,
): Promise<T>;
export async function request<T>(
  url: string,
  { optional = false, ...options }: RequestOptions = {},
): Promise<T | null> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    if (optional && response.status === 404) return null;
    let message = "";
    try {
      message = ((await response.json()) as { error?: string }).error || "";
    } catch {
      // Not JSON: use the generic message.
    }
    throw new RequestError(
      message ||
        `Could not ${options.method === "PUT" ? "save" : "load"} ${new URL(url, location.href).pathname}`,
      response.status,
    );
  }
  return response.status === 204 ? null : ((await response.json()) as T);
}

export const mutate = <T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> =>
  request<T>(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** An app file's URL, relative to the editor's base (…/store-listing/studio/). */
export const asset = (base: string, file: string): string =>
  new URL(file, new URL(base, location.origin)).href;

export const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
