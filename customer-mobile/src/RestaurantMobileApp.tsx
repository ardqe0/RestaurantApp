import { Component, type ReactNode, useEffect, useState } from "react";
import { Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import CustomerScreen from "../App";
import { AdminScreen } from "./AdminScreen";
import { checkForNewAndroidVersion } from "./appVersion";
import { logout, restoreSession } from "./auth";
import { AuthScreen, LoadingScreen } from "./AuthScreen";
import { defaultApiBaseUrl } from "./config";
import { KitchenScreen } from "./KitchenScreen";
import { registerKitchenNotifications, registerOrderNotifications } from "./notifications";
import type { AuthSession } from "./auth";

export default function RestaurantMobileApp() {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void checkForNewAndroidVersion(defaultApiBaseUrl).catch(() => undefined);
    void restoreSession(defaultApiBaseUrl).then((restoredSession) => {
      if (active) setSession(restoredSession);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (session?.role !== "Customer") return;

    void registerOrderNotifications(defaultApiBaseUrl).catch((reason) => {
      console.warn("Sipariş bildirimleri etkinleştirilemedi.", reason);
    });
  }, [session]);

  useEffect(() => {
    if (session?.role !== "Kitchen") return;

    void registerKitchenNotifications().catch((reason) => {
      console.warn("Mutfak bildirimleri etkinleştirilemedi.", reason);
    });
  }, [session]);

  async function handleLogout() {
    try {
      await logout(defaultApiBaseUrl);
    } finally {
      setSession(null);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = window.location.origin;
      }
    }
  }

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <AuthScreen apiBaseUrl={defaultApiBaseUrl} onAuthenticated={setSession} />;

  if (session.role === "Customer") {
    return <CustomerScreen authSession={session} initialApiBaseUrl={defaultApiBaseUrl} onLogout={handleLogout} />;
  }

  if (session.role === "Kitchen") {
    return (
      <KitchenErrorBoundary onReset={handleLogout}>
        <KitchenScreen apiBaseUrl={defaultApiBaseUrl} username={session.username} onLogout={handleLogout} />
      </KitchenErrorBoundary>
    );
  }

  return <AdminScreen apiBaseUrl={defaultApiBaseUrl} username={session.username} onLogout={handleLogout} />;
}

class KitchenErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void | Promise<void> },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <SafeAreaView style={errorStyles.safeArea}>
        <View style={errorStyles.card}>
          <Text style={errorStyles.title}>Mutfak ekranı açılamadı</Text>
          <Text style={errorStyles.message}>{this.state.error.message || "Beklenmeyen bir uygulama hatası oluştu."}</Text>
          <Pressable onPress={() => void this.props.onReset()} style={errorStyles.button}>
            <Text style={errorStyles.buttonText}>Çıkış yap ve tekrar dene</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const errorStyles = StyleSheet.create({
  safeArea: { alignItems: "center", backgroundColor: "#17212b", flex: 1, justifyContent: "center", padding: 18 },
  card: { backgroundColor: "#ffffff", borderRadius: 12, gap: 12, maxWidth: 430, padding: 20, width: "100%" },
  title: { color: "#17212b", fontSize: 21, fontWeight: "900" },
  message: { color: "#b42318", fontSize: 13, lineHeight: 19 },
  button: { alignItems: "center", backgroundColor: "#31475d", borderRadius: 8, paddingVertical: 12 },
  buttonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" }
});
