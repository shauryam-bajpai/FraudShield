const API_BASE =
    process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://127.0.0.1:3001";

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string
    ) {
        super(message);
        this.name = "ApiError";
    }
}

async function refreshAccessToken(): Promise<string | null> {
    if (!refreshPromise) {
        refreshPromise = (async () => {
            const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
                method: "POST",
                credentials: "include",
            });

            if (!response.ok) {
                accessToken = null;
                return null;
            }

            const data = (await response.json()) as { access_token: string };
            accessToken = data.access_token;
            return accessToken;
        })().finally(() => {
            refreshPromise = null;
        });
    }

    return refreshPromise;
}

export async function apiRequest<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    let token = accessToken ?? (await refreshAccessToken());

    if (!token) {
        throw new ApiError(401, "Your session has expired. Please sign in again.");
    }

    const send = (currentToken: string) =>
        fetch(`${API_BASE}${path}`, {
            ...options,
            credentials: "include",
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...options.headers,
                Authorization: `Bearer ${currentToken}`,
            },
        });

    let response = await send(token);

    if (response.status === 401) {
        accessToken = null;
        token = await refreshAccessToken();

        if (!token) {
            throw new ApiError(401, "Your session has expired. Please sign in again.");
        }

        response = await send(token);
    }

    if (!response.ok) {
        let message = `Request failed (${response.status}).`;

        try {
            const body = (await response.json()) as {
                error?: string;
                detail?: string;
            };
            message = body.error ?? body.detail ?? message;
        } catch {
            // Keep the HTTP status message if the response is not JSON.
        }

        throw new ApiError(response.status, message);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
}