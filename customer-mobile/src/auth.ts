import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export type AuthRole = "Customer" | "Kitchen" | "Admin";

export type AuthSession = {
  username: string;
  role: AuthRole;
  email?: string | null;
  phoneNumber?: string | null;
};

type NativeAuthResponse = AuthSession & {
  accessToken: string;
};

const tokenStorageKey = "restaurant_auth_token";

async function readError(response: Response) {
  const body = await response.text();
  if (!body) return `İstek başarısız oldu: ${response.status}`;

  try {
    const parsed = JSON.parse(body) as string | { title?: string; detail?: string; errors?: Record<string, string[]> };
    if (typeof parsed === "string") return parsed;
    if (parsed.detail) return parsed.detail;
    if (parsed.errors) return Object.values(parsed.errors).flat().join(" ");
    if (parsed.title) return parsed.title;
  } catch {
    // Sunucu düz metin döndürdüyse olduğu gibi gösterilir.
  }

  return body;
}

async function request<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers
    }
  });

  if (!response.ok) throw new Error(await readError(response));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getAccessToken() {
  if (Platform.OS === "web") return null;
  return SecureStore.getItemAsync(tokenStorageKey);
}

export async function getAuthorizationHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function restoreSession(baseUrl: string): Promise<AuthSession | null> {
  if (Platform.OS !== "web" && !await getAccessToken()) return null;

  try {
    return await request<AuthSession>(baseUrl, "/api/auth/me");
  } catch {
    if (Platform.OS !== "web") await SecureStore.deleteItemAsync(tokenStorageKey);
    return null;
  }
}

export async function login(baseUrl: string, username: string, password: string): Promise<AuthSession> {
  const path = Platform.OS === "web" ? "/api/auth/login" : "/api/auth/native/login";
  const response = await request<AuthSession | NativeAuthResponse>(baseUrl, path, {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  if (Platform.OS !== "web") {
    const nativeResponse = response as NativeAuthResponse;
    await SecureStore.setItemAsync(tokenStorageKey, nativeResponse.accessToken);
  }

  return {
    username: response.username,
    role: response.role,
    email: response.email,
    phoneNumber: response.phoneNumber
  };
}

export async function register(
  baseUrl: string,
  username: string,
  password: string,
  email: string,
  phoneNumber: string
): Promise<AuthSession> {
  const path = Platform.OS === "web" ? "/api/auth/register" : "/api/auth/native/register";
  const response = await request<AuthSession | NativeAuthResponse>(baseUrl, path, {
    method: "POST",
    body: JSON.stringify({ username, password, email, phoneNumber })
  });

  if (Platform.OS !== "web") {
    const nativeResponse = response as NativeAuthResponse;
    await SecureStore.setItemAsync(tokenStorageKey, nativeResponse.accessToken);
  }

  return {
    username: response.username,
    role: response.role,
    email: response.email,
    phoneNumber: response.phoneNumber
  };
}

export async function logout(baseUrl: string) {
  if (Platform.OS === "web") {
    await request<void>(baseUrl, "/api/auth/logout", { method: "POST" });
    return;
  }

  await SecureStore.deleteItemAsync(tokenStorageKey);
}

export async function updateProfile(baseUrl: string, email: string, phoneNumber: string): Promise<AuthSession> {
  return request<AuthSession>(baseUrl, "/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify({ email, phoneNumber })
  });
}

export async function changePassword(baseUrl: string, currentPassword: string, newPassword: string) {
  return request<void>(baseUrl, "/api/auth/password", {
    method: "PUT",
    body: JSON.stringify({ currentPassword, newPassword })
  });
}
