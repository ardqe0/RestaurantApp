import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken } from "./api";
import type { OrderDto } from "./types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export async function registerOrderNotifications(apiBaseUrl: string) {
  if (Platform.OS === "web") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Sipariş durumları",
      description: "Aktif siparişinizin hazırlanma ve teslim durumları",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: "#168569",
      sound: "default"
    });
  }

  const currentPermission = await Notifications.getPermissionsAsync();
  const permission = currentPermission.status === "granted"
    ? currentPermission
    : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error("Expo proje kimliği bulunamadı.");
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(apiBaseUrl, token.data, Platform.OS);
}

export async function registerKitchenNotifications() {
  if (Platform.OS === "web") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("kitchen-alerts", {
      name: "Mutfak uyarıları",
      description: "Yeni ve uzun süredir bekleyen sipariş uyarıları",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 150, 300],
      lightColor: "#dc2626",
      sound: "default"
    });
  }

  const currentPermission = await Notifications.getPermissionsAsync();
  if (currentPermission.status !== "granted") {
    await Notifications.requestPermissionsAsync();
  }
}

export async function showKitchenAlertNotification(
  order: OrderDto,
  kind: "new" | "overdue",
  waitingMinutes = 0
) {
  if (Platform.OS === "web") return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: kind === "new" ? "Yeni sipariş geldi" : "Sipariş uzun süredir bekliyor",
      body: kind === "new"
        ? `Masa ${order.tableNumber} · Sipariş #${order.id}`
        : `Masa ${order.tableNumber} · ${waitingMinutes} dakikadır bekliyor`,
      data: { orderId: order.id, tableNumber: order.tableNumber, kind },
      sound: "default"
    },
    trigger: null
  });
}

export async function showLocalOrderStatusNotification(order: OrderDto) {
  if (Platform.OS === "web") return;

  const contents: Partial<Record<OrderDto["status"], { title: string; body: string }>> = {
    Preparing: {
      title: "Siparişiniz hazırlanıyor",
      body: "Mutfak siparişinizi hazırlamaya başladı."
    },
    Ready: {
      title: "Siparişiniz hazır",
      body: "Siparişiniz hazırlandı. Afiyet olsun!"
    },
    Cancelled: {
      title: "Siparişiniz iptal edildi",
      body: order.cancellationReason || "Restoran siparişinizi iptal etti."
    },
    Delivered: {
      title: "Ödeme tamamlandı",
      body: "Ödemeniz alındı. Bizi tercih ettiğiniz için teşekkür ederiz."
    }
  };
  const content = contents[order.status];
  if (!content) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: content.title,
      body: `Sipariş #${order.id} · Masa ${order.tableNumber}\n${content.body}`,
      data: { orderId: order.id, tableNumber: order.tableNumber, status: order.status },
      sound: "default"
    },
    trigger: null
  });
}
