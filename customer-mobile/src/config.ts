import { Platform } from "react-native";

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/$/, "");
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

export const defaultApiBaseUrl = Platform.OS === "web" && typeof window !== "undefined"
  ? window.location.origin
  : trimTrailingSlash(configuredApiUrl || "http://10.0.2.2:5223");
