import { Platform } from "react-native";
import { defaultApiBaseUrl } from "./config";

export type RestaurantOption = {
  id: string;
  name: string;
  description: string;
  apiBaseUrl: string;
};

export type RestaurantQrSession = {
  restaurant: RestaurantOption;
  tableCode: string;
  apiBaseUrl: string;
};

// Yeni restoran eklendiğinde burada kendi API adresiyle tanımlanır.
// Müşteri uygulaması seçilen restorana göre otomatik olarak ilgili API'yi kullanır.
export const restaurants: RestaurantOption[] = [
  {
    id: "lezzet-duragi",
    name: "Lezzet Durağı",
    description: "Aktif menü ve mutfak akışı",
    apiBaseUrl: defaultApiBaseUrl
  }
];

export function parseRestaurantTableQr(value: string): RestaurantQrSession | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (!/^\/customer(?:\/|$)/i.test(url.pathname)) {
      return null;
    }

    const restaurantId = url.searchParams.get("restaurant")?.trim();
    const tableCode = url.searchParams.get("table")?.trim();
    const restaurant = restaurants.find((option) => option.id === restaurantId);

    if (!restaurant || !tableCode) {
      return null;
    }

    // QR bağlantısının origin değeri yalnızca web uygulamasında kullanılabilir.
    // Native uygulama QR'dan sadece restoran ve masa kodunu alır; API adresi
    // derleme ortamındaki güvenilir restoran yapılandırmasından gelir. Böylece
    // eski localhost/LAN adresleri telefonda API adresi olarak kullanılamaz.
    const apiBaseUrl = Platform.OS === "web" && typeof window !== "undefined"
      ? window.location.origin
      : restaurant.apiBaseUrl;

    return {
      restaurant,
      tableCode,
      apiBaseUrl
    };
  } catch {
    return null;
  }
}
