import Constants from "expo-constants";
import { Alert, Linking, Platform } from "react-native";
import type { AppVersionDto } from "./types";

export async function checkForNewAndroidVersion(apiBaseUrl: string) {
  if (Platform.OS !== "android") return;

  const response = await fetch(`${apiBaseUrl}/api/app-version/android`);
  if (!response.ok) return;

  const latest = await response.json() as AppVersionDto;
  const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
  if (compareVersions(latest.version, currentVersion) <= 0 || !latest.downloadUrl) return;

  Alert.alert(
    latest.isRequired ? "Güncelleme gerekli" : "Yeni sürüm mevcut",
    `Yeni sürüm: ${latest.version}\nYüklü sürüm: ${currentVersion}`,
    [
      ...(!latest.isRequired ? [{ text: "Daha sonra", style: "cancel" as const }] : []),
      {
        text: "İndirme sayfasını aç",
        onPress: () => void Linking.openURL(latest.downloadUrl)
      }
    ],
    { cancelable: !latest.isRequired }
  );
}

function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
