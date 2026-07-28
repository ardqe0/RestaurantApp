import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  addFavorite,
  createOrder,
  getCustomerOrderHistory,
  getFavorites,
  getMenu,
  getOrder,
  getTable,
  removeFavorite,
  requestPayment,
  upsertOrderReview
} from "./src/api";
import { parseRestaurantTableQr, restaurants } from "./src/restaurants";
import { WebQrScanner } from "./src/WebQrScanner";
import {
  AccountSection,
  CustomerBottomNavigation
} from "./src/CustomerSections";
import { getAccessToken, type AuthSession } from "./src/auth";
import type { CustomerSection } from "./src/CustomerSections";
import { showLocalOrderStatusNotification } from "./src/notifications";
import type { RestaurantQrSession } from "./src/restaurants";
import type { CartLine, MenuCategoryDto, MenuItemDto, OrderDto, PaymentMethod, TableDto } from "./src/types";

const initialRestaurant = restaurants[0]!;

export default function CustomerScreen({
  authSession,
  initialApiBaseUrl = initialRestaurant.apiBaseUrl,
  onLogout
}: {
  authSession: AuthSession;
  initialApiBaseUrl?: string;
  onLogout?: () => void | Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [session, setSession] = useState<RestaurantQrSession | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState(initialApiBaseUrl);
  const [table, setTable] = useState<TableDto | null>(null);
  const [menu, setMenu] = useState<MenuCategoryDto[]>([]);
  const [cart, setCart] = useState<Record<number, CartLine>>({});
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScannerLocked, setIsScannerLocked] = useState(false);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"idle" | "connecting" | "connected" | "fallback">("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<CustomerSection>("order");
  const [profileSession, setProfileSession] = useState(authSession);
  const [favorites, setFavorites] = useState<MenuItemDto[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderDto[]>([]);
  const [isAccountDataLoading, setIsAccountDataLoading] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<MenuItemDto | null>(null);
  const [customNote, setCustomNote] = useState("");
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<number>>(new Set());
  const [reviewingOrder, setReviewingOrder] = useState<OrderDto | null>(null);
  const [reviewAfterPayment, setReviewAfterPayment] = useState(false);
  const [isReviewSaving, setIsReviewSaving] = useState(false);
  const directLinkHandled = useRef(false);
  const scannerLock = useRef(false);
  const completedOrderRef = useRef<number | null>(null);
  const lastOrderStatusRef = useRef<OrderDto["status"] | null>(null);

  const cartLines = useMemo(() => Object.values(cart), [cart]);
  const cartTotal = useMemo(
    () => cartLines.reduce(
      (total, line) => total + (
        line.menuItem.price + line.selectedOptions.reduce((sum, option) => sum + option.additionalPrice, 0)
      ) * line.quantity,
      0
    ),
    [cartLines]
  );
  const favoriteIds = useMemo(() => new Set(favorites.map((item) => item.id)), [favorites]);
  const menuItemsById = useMemo(
    () => new Map(menu.flatMap((category) => category.items).map((item) => [item.id, item])),
    [menu]
  );
  const isCameraBlockedByBrowser = useMemo(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return false;
    }

    const host = window.location.hostname.toLowerCase();
    const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";

    return window.isSecureContext === false && !isLocalHost;
  }, []);

  const loadAccountData = useCallback(async () => {
    setIsAccountDataLoading(true);
    try {
      const [nextFavorites, nextHistory] = await Promise.all([
        getFavorites(apiBaseUrl),
        getCustomerOrderHistory(apiBaseUrl)
      ]);
      setFavorites(nextFavorites);
      setOrderHistory(nextHistory);
    } catch {
      // İlk kurulumda backend henüz yeniden başlamadıysa sonraki sekme
      // yenilemesinde tekrar denenecek.
    } finally {
      setIsAccountDataLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadAccountData();
  }, [loadAccountData]);

  const resetToScanner = useCallback(() => {
    setSession(null);
    setTable(null);
    setMenu([]);
    setCart({});
    setOrder(null);
    lastOrderStatusRef.current = null;
    completedOrderRef.current = null;
    scannerLock.current = false;
    setIsScannerLocked(false);

    if (
      Platform.OS === "web"
      && typeof window !== "undefined"
      && window.location.pathname.toLowerCase().startsWith("/customer")
    ) {
      window.history.replaceState({}, "", "/customer");
    }
  }, []);

  const startSessionFromQr = useCallback(async (qrValue: string) => {
    if (scannerLock.current) {
      return;
    }

    scannerLock.current = true;
    const qrSession = parseRestaurantTableQr(qrValue);
    if (!qrSession) {
      setError("Bu QR kodu geçerli bir restoran masasına ait değil. Lütfen masadaki QR kodunu okutun.");
      scannerLock.current = false;
      setIsScannerLocked(false);
      return;
    }

    setIsScannerLocked(true);
    setIsLoading(true);
    setError(null);

    try {
      const [tableResponse, menuResponse] = await Promise.all([
        getTable(qrSession.apiBaseUrl, qrSession.tableCode),
        getMenu(qrSession.apiBaseUrl)
      ]);

      if (tableResponse.status !== "Empty") {
        throw new Error("Bu masa şu anda dolu. Lütfen restoran görevlisinden yardım isteyin.");
      }

      setApiBaseUrl(qrSession.apiBaseUrl);
      setSession(qrSession);
      setTable(tableResponse);
      setMenu(menuResponse);
      setOrder(null);
      lastOrderStatusRef.current = null;
      setCart({});

      if (Platform.OS === "web" && typeof window !== "undefined") {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set("restaurant", qrSession.restaurant.id);
        currentUrl.searchParams.set("table", qrSession.tableCode);
        window.history.replaceState({}, "", `${currentUrl.pathname}?${currentUrl.searchParams.toString()}`);
      }
    } catch (err) {
      setSession(null);
      setTable(null);
      setMenu([]);
      setError(err instanceof Error ? err.message : "QR kodu ile masa açılamadı.");
      scannerLock.current = false;
      setIsScannerLocked(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || directLinkHandled.current) {
      return;
    }

    directLinkHandled.current = true;
    if (parseRestaurantTableQr(window.location.href)) {
      void startSessionFromQr(window.location.href);
    }
  }, [startSessionFromQr]);

  const refreshTrackedOrder = useCallback(async (orderId: number) => {
    try {
      const freshOrder = await getOrder(apiBaseUrl.trim(), orderId);
      const previousStatus = lastOrderStatusRef.current;
      lastOrderStatusRef.current = freshOrder.status;
      if (previousStatus && previousStatus !== freshOrder.status) {
        void showLocalOrderStatusNotification(freshOrder);
      }
      if (freshOrder.status === "Delivered") {
        if (completedOrderRef.current !== orderId) {
          completedOrderRef.current = orderId;
          setReviewAfterPayment(true);
          setReviewingOrder(freshOrder);
          setOrderHistory((current) => [
            freshOrder,
            ...current.filter((item) => item.id !== freshOrder.id)
          ]);
          setActiveSection("order");
          resetToScanner();
          void loadAccountData();
        }
        return;
      }

      setOrder(freshOrder);
    } catch {
      // SignalR bağlantısı koparsa aşağıdaki seyrek kontrol tekrar deneyecek.
    }
  }, [apiBaseUrl, loadAccountData, resetToScanner]);

  useEffect(() => {
    const trackedOrderId = order?.id;
    if (!trackedOrderId || order.status === "Delivered" || order.status === "Cancelled") {
      setRealtimeStatus("idle");
      return;
    }

    let active = true;
    const hubUrl = `${apiBaseUrl.trim().replace(/\/$/, "")}/hubs/orders`;
    const connection = new HubConnectionBuilder()
      .withUrl(hubUrl, {
        withCredentials: true,
        accessTokenFactory: async () => await getAccessToken() ?? ""
      })
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000])
      .configureLogging(LogLevel.Warning)
      .build();

    const refreshFromEvent = (event: { orderId: number }) => {
      if (active && event.orderId === trackedOrderId) {
        void refreshTrackedOrder(trackedOrderId);
      }
    };

    connection.on("OrderStatusChanged", refreshFromEvent);
    connection.on("OrderItemStatusChanged", refreshFromEvent);
    connection.onreconnecting(() => active && setRealtimeStatus("fallback"));
    connection.onreconnected(() => active && setRealtimeStatus("connected"));
    connection.onclose(() => active && setRealtimeStatus("fallback"));

    setRealtimeStatus("connecting");
    void connection.start()
      .then(() => active && setRealtimeStatus("connected"))
      .catch(() => active && setRealtimeStatus("fallback"));

    // WebSocket kullanılamayan ağlarda sipariş yine güncel kalır.
    const refreshInterval = order.tableStatus === "WaitingForPayment" ? 3_000 : 10_000;
    const fallbackTimer = setInterval(() => {
      void refreshTrackedOrder(trackedOrderId);
    }, refreshInterval);

    return () => {
      active = false;
      clearInterval(fallbackTimer);
      connection.off("OrderStatusChanged", refreshFromEvent);
      connection.off("OrderItemStatusChanged", refreshFromEvent);
      if (connection.state !== HubConnectionState.Disconnected) {
        void connection.stop();
      }
    };
  }, [apiBaseUrl, order?.id, order?.status, order?.tableStatus, refreshTrackedOrder]);

  function addItem(menuItem: MenuItemDto) {
    setCart((current) => {
      const existingLine = current[menuItem.id];
      return {
        ...current,
        [menuItem.id]: {
          menuItem,
          quantity: existingLine ? existingLine.quantity + 1 : 1,
          note: existingLine?.note,
          selectedOptions: existingLine?.selectedOptions ?? []
        }
      };
    });
  }

  function openCustomizer(menuItem: MenuItemDto) {
    const existingLine = cart[menuItem.id];
    setCustomizingItem(menuItem);
    setCustomNote(existingLine?.note ?? "");
    setSelectedOptionIds(new Set(existingLine?.selectedOptions.map((option) => option.id) ?? []));
  }

  function toggleOption(optionId: number) {
    setSelectedOptionIds((current) => {
      const next = new Set(current);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  function saveCustomization() {
    if (!customizingItem) return;
    const selectedOptions = (customizingItem.options ?? [])
      .filter((option) => selectedOptionIds.has(option.id));
    setCart((current) => ({
      ...current,
      [customizingItem.id]: {
        menuItem: customizingItem,
        quantity: current[customizingItem.id]?.quantity ?? 1,
        note: customNote.trim() || undefined,
        selectedOptions
      }
    }));
    setCustomizingItem(null);
    setCustomNote("");
    setSelectedOptionIds(new Set());
  }

  async function toggleFavorite(menuItem: MenuItemDto) {
    try {
      if (favoriteIds.has(menuItem.id)) {
        await removeFavorite(apiBaseUrl, menuItem.id);
        setFavorites((current) => current.filter((item) => item.id !== menuItem.id));
      } else {
        await addFavorite(apiBaseUrl, menuItem.id);
        setFavorites((current) => [menuItem, ...current]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Favori güncellenemedi.");
    }
  }

  async function removeFavoriteItem(menuItemId: number) {
    try {
      await removeFavorite(apiBaseUrl, menuItemId);
      setFavorites((current) => current.filter((item) => item.id !== menuItemId));
    } catch {
      Alert.alert("Favori kaldırılamadı", "Lütfen tekrar deneyin.");
    }
  }

  function reorder(previousOrder: OrderDto) {
    if (!table || order) {
      Alert.alert("Önce masa QR kodunu okutun", "Tekrar sipariş verebilmek için boş bir masada aktif oturum açmalısınız.");
      setActiveSection("order");
      return;
    }

    const nextCart: Record<number, CartLine> = {};
    for (const previousItem of previousOrder.items) {
      const menuItem = menuItemsById.get(previousItem.menuItemId);
      if (!menuItem?.isAvailable) continue;
      nextCart[menuItem.id] = {
        menuItem,
        quantity: previousItem.quantity,
        note: undefined,
        selectedOptions: []
      };
    }

    if (Object.keys(nextCart).length === 0) {
      Alert.alert("Ürünler bulunamadı", "Bu siparişteki ürünler şu anda satışta değil.");
      return;
    }

    setCart(nextCart);
    setActiveSection("order");
    Alert.alert("Sepet hazırlandı", "Ücretli ekstralar ve özel notlar yeniden seçilmelidir.");
  }

  function removeItem(menuItemId: number) {
    setCart((current) => {
      const existingLine = current[menuItemId];
      if (!existingLine) {
        return current;
      }

      const next = { ...current };
      if (existingLine.quantity <= 1) {
        delete next[menuItemId];
      } else {
        next[menuItemId] = { ...existingLine, quantity: existingLine.quantity - 1 };
      }

      return next;
    });
  }

  async function submitOrder() {
    if (!table || cartLines.length === 0) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const createdOrder = await createOrder(
        apiBaseUrl.trim(),
        table.id,
        cartLines.map((line) => ({
          menuItemId: line.menuItem.id,
          quantity: line.quantity,
          note: line.note,
          optionIds: line.selectedOptions.map((option) => option.id)
        }))
      );

      setOrder(createdOrder);
      lastOrderStatusRef.current = createdOrder.status;
      setOrderHistory((current) => [createdOrder, ...current.filter((item) => item.id !== createdOrder.id)]);
      completedOrderRef.current = null;
      setCart({});
      Alert.alert("Siparişiniz alındı", "Yemeğiniz kısa sürede gelecek. Afiyet olsun!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sipariş gönderilemedi.");
    } finally {
      setIsLoading(false);
    }
  }

  function startNewOrderAfterCancellation() {
    setOrder(null);
    lastOrderStatusRef.current = null;
    setCart({});
    setError(null);
  }

  async function askForPayment(method: PaymentMethod) {
    if (!order) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await requestPayment(apiBaseUrl.trim(), order.id, method);
      Alert.alert("Hesap istendi", "Hesabınız kısa sürede gelecektir.");
      const freshOrder = await getOrder(apiBaseUrl.trim(), order.id);
      setOrder(freshOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hesap istenemedi.");
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    if (onLogout) {
      await onLogout();
      return;
    }

    if (typeof window !== "undefined") {
      window.location.href = window.location.origin;
    }
  }

  function openReview(orderToReview: OrderDto) {
    setReviewAfterPayment(false);
    setReviewingOrder(orderToReview);
  }

  async function saveReview(rating: number, comment: string) {
    if (!reviewingOrder) return;

    setIsReviewSaving(true);
    try {
      const review = await upsertOrderReview(apiBaseUrl, reviewingOrder.id, rating, comment.trim());
      setOrderHistory((current) => current.map((historyOrder) => (
        historyOrder.id === reviewingOrder.id ? { ...historyOrder, review } : historyOrder
      )));
      setReviewingOrder(null);
      setReviewAfterPayment(false);
      Alert.alert("Teşekkür ederiz", "Değerlendirmeniz kaydedildi.");
    } catch (reason) {
      Alert.alert(
        "Değerlendirme kaydedilemedi",
        reason instanceof Error ? reason.message : "Lütfen tekrar deneyin."
      );
    } finally {
      setIsReviewSaving(false);
    }
  }

  const reviewModal = (
    <OrderReviewModal
      afterPayment={reviewAfterPayment}
      isSaving={isReviewSaving}
      onClose={() => {
        setReviewingOrder(null);
        setReviewAfterPayment(false);
      }}
      onSubmit={saveReview}
      order={reviewingOrder}
    />
  );

  if (activeSection === "account") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.container}>
          <AccountSection
            apiBaseUrl={apiBaseUrl}
            session={profileSession}
            onSessionChange={setProfileSession}
            onLogout={logout}
            favorites={favorites}
            canOrder={Boolean(table && !order)}
            onRemoveFavorite={removeFavoriteItem}
            onAddToCart={openCustomizer}
            onGoToScanner={() => setActiveSection("order")}
            orders={orderHistory}
            isHistoryLoading={isAccountDataLoading}
            onRefreshHistory={loadAccountData}
            onReorder={reorder}
            onReview={openReview}
          />
        </ScrollView>
        {reviewModal}
        <CustomerBottomNavigation activeSection={activeSection} onChange={setActiveSection} />
        <ProductCustomizer
          item={customizingItem}
          note={customNote}
          selectedOptionIds={selectedOptionIds}
          onClose={() => setCustomizingItem(null)}
          onNoteChange={setCustomNote}
          onSave={saveCustomization}
          onToggleOption={toggleOption}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.flex}>
              <Text style={styles.kicker}>Müşteri sipariş ekranı</Text>
              <Text style={styles.title}>Masadan sipariş ver</Text>
            </View>
          </View>
        </View>

        {!table ? (
          <View style={styles.scannerPanel}>
            <View style={styles.scannerHeading}>
              <Text style={styles.scannerTitle}>Masadaki QR kodunu okut</Text>
              <Text style={styles.scannerDescription}>Restoran ve masa otomatik olarak tanınacak.</Text>
            </View>

            {isCameraBlockedByBrowser ? (
              <View style={styles.permissionPanel}>
                <Text style={styles.permissionIcon}>!</Text>
                <Text style={styles.permissionTitle}>Telefon tarayıcısı kamerayı engelliyor</Text>
                <Text style={styles.permissionText}>
                  Bu sayfa HTTP ile açıldığı için mobil tarayıcı kamera izni vermez. QR kodunu telefonun kamera uygulaması
                  ile okutun; masa otomatik açılır.
                </Text>
              </View>
            ) : Platform.OS === "web" ? (
              <WebQrScanner
                active={!isScannerLocked}
                onScanned={startSessionFromQr}
              />
            ) : !permission ? (
              <View style={styles.permissionPanel}>
                <ActivityIndicator color="#146c5f" />
                <Text style={styles.permissionText}>Kamera hazırlanıyor...</Text>
              </View>
            ) : !permission.granted ? (
              <View style={styles.permissionPanel}>
                <Text style={styles.permissionIcon}>▣</Text>
                <Text style={styles.permissionTitle}>Kamera izni gerekli</Text>
                <Text style={styles.permissionText}>Masa QR kodunu okuyabilmek için kamera erişimine izin verin.</Text>
                {permission.canAskAgain ? (
                  <Pressable
                    onPress={async () => {
                      setError(null);
                      setCameraPermissionError(null);

                      try {
                        await requestPermission();
                      } catch {
                      setCameraPermissionError("Tarayıcı kamera iznini açamadı. QR kodunu telefonun kamera uygulaması ile okutun.");
                      }
                    }}
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>Kamera izni ver</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.permissionHelp}>Kamera iznini telefon ayarlarından etkinleştirin.</Text>
                )}
                {cameraPermissionError ? <Text style={styles.permissionHelp}>{cameraPermissionError}</Text> : null}
              </View>
            ) : (
              <>
                <View style={styles.cameraFrame}>
                  <CameraView
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    facing="back"
                    onBarcodeScanned={isScannerLocked ? undefined : ({ data }) => {
                      void startSessionFromQr(data);
                    }}
                    style={styles.camera}
                  >
                    <View pointerEvents="none" style={styles.cameraOverlay}>
                      <View style={styles.scanTarget} />
                    </View>
                  </CameraView>
                </View>
                <Text style={styles.scannerHint}>QR kodunu çerçevenin içine getirin.</Text>
              </>
            )}

            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#146c5f" />
                <Text style={styles.loadingText}>Restoran ve masa açılıyor...</Text>
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {error && !isLoading && permission?.granted ? (
              <Pressable
                onPress={() => {
                  setError(null);
                  scannerLock.current = false;
                  setIsScannerLocked(false);
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Tekrar tara</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {table && session ? (
          <View style={styles.sessionCard}>
            <View style={styles.sessionCheck}><Text style={styles.sessionCheckText}>✓</Text></View>
            <View style={styles.flex}>
              <Text style={styles.sessionRestaurant}>{session.restaurant.name}</Text>
              <Text style={styles.sessionTable}>Masa {table.number} · QR ile otomatik seçildi</Text>
            </View>
          </View>
        ) : null}

        {table && error ? <Text style={styles.error}>{error}</Text> : null}

        {order ? (
          <OrderPanel
            order={order}
            realtimeStatus={realtimeStatus}
            onRequestPayment={askForPayment}
            onStartNewOrder={startNewOrderAfterCancellation}
            isLoading={isLoading}
          />
        ) : null}

        {table && !order ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Menü</Text>
              <Text style={styles.meta}>{menu.reduce((count, category) => count + category.items.length, 0)} ürün</Text>
            </View>

            {menu.map((category) => (
              <View key={category.id} style={styles.category}>
                <Text style={styles.categoryTitle}>{category.name}</Text>
                {category.items.map((item) => (
                  <View key={item.id} style={styles.menuItem}>
                    {item.imageUrl ? (
                      <Image source={{ uri: resolveImageUrl(item.imageUrl, apiBaseUrl) }} style={styles.menuImage} />
                    ) : (
                      <View style={styles.menuImagePlaceholder}><Text style={styles.menuImagePlaceholderText}>🍽️</Text></View>
                    )}
                    <View style={styles.flex}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemDescription}>{item.description}</Text>
                      <Text style={styles.meta}>
                        {item.preparationMinutes} dk{item.options?.length ? ` · ${item.options.length} ekstra` : ""}
                      </Text>
                    </View>
                    <View style={styles.itemActions}>
                      <Text style={styles.price}>{formatCurrency(item.price)}</Text>
                      <Pressable onPress={() => void toggleFavorite(item)} style={styles.favoriteButton}>
                        <Text style={styles.favoriteButtonText}>{favoriteIds.has(item.id) ? "♥" : "♡"}</Text>
                      </Pressable>
                      <Pressable onPress={() => openCustomizer(item)} style={styles.smallButton}>
                        <Text style={styles.smallButtonText}>Ekle</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ))}

            <View style={styles.cartPanel}>
              <Text style={styles.sectionTitle}>Sepet</Text>
              {cartLines.length === 0 ? (
                <Text style={styles.empty}>Sepette ürün yok.</Text>
              ) : (
                cartLines.map((line) => (
                  <View key={line.menuItem.id} style={styles.cartLine}>
                    <View style={styles.flex}>
                      <Text style={styles.itemName}>{line.menuItem.name}</Text>
                      <Text style={styles.meta}>
                        {line.quantity} x {formatCurrency(
                          line.menuItem.price + line.selectedOptions.reduce((sum, option) => sum + option.additionalPrice, 0)
                        )}
                      </Text>
                      {line.selectedOptions.length > 0 ? (
                        <Text style={styles.cartDetail}>Ekstralar: {line.selectedOptions.map((option) => option.name).join(", ")}</Text>
                      ) : null}
                      {line.note ? <Text style={styles.cartDetail}>Not: {line.note}</Text> : null}
                      <Pressable onPress={() => openCustomizer(line.menuItem)}>
                        <Text style={styles.editCustomization}>Seçenekleri düzenle</Text>
                      </Pressable>
                    </View>
                    <View style={styles.quantityActions}>
                      <Pressable onPress={() => removeItem(line.menuItem.id)} style={styles.quantityButton}>
                        <Text style={styles.quantityText}>-</Text>
                      </Pressable>
                      <Text style={styles.quantityValue}>{line.quantity}</Text>
                      <Pressable onPress={() => addItem(line.menuItem)} style={styles.quantityButton}>
                        <Text style={styles.quantityText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Toplam</Text>
                <Text style={styles.totalValue}>{formatCurrency(cartTotal)}</Text>
              </View>
              <Pressable
                disabled={isLoading || cartLines.length === 0}
                onPress={submitOrder}
                style={[styles.primaryButton, cartLines.length === 0 ? styles.disabled : null]}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Siparişi gönder</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
      <ProductCustomizer
        item={customizingItem}
        note={customNote}
        selectedOptionIds={selectedOptionIds}
        onClose={() => setCustomizingItem(null)}
        onNoteChange={setCustomNote}
        onSave={saveCustomization}
        onToggleOption={toggleOption}
      />
      {reviewModal}
      <CustomerBottomNavigation activeSection={activeSection} onChange={setActiveSection} />
    </SafeAreaView>
  );
}

function OrderReviewModal({
  order,
  afterPayment,
  isSaving,
  onClose,
  onSubmit
}: {
  order: OrderDto | null;
  afterPayment: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void | Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    setRating(order?.review?.rating ?? 0);
    setComment(order?.review?.comment ?? "");
  }, [order]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={order !== null}>
      <SafeAreaView style={styles.reviewScreen}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.reviewKeyboard}
        >
          <View style={styles.reviewHeader}>
            <View style={styles.flex}>
              <Text style={styles.reviewKicker}>{afterPayment ? "ÖDEME TAMAMLANDI" : `SİPARİŞ #${order?.id ?? ""}`}</Text>
              <Text style={styles.reviewTitle}>
                {afterPayment ? "Bizi değerlendirmek ister misiniz?" : "Siparişi değerlendir"}
              </Text>
            </View>
            <Pressable accessibilityLabel="Kapat" onPress={onClose} style={styles.reviewClose}>
              <Text style={styles.reviewCloseText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.reviewContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            {afterPayment ? (
              <Text style={styles.reviewThanks}>
                Teşekkür ederiz. Değerlendirme isteğe bağlıdır; dilerseniz daha sonra Geçmiş siparişlerden de yapabilirsiniz.
              </Text>
            ) : null}

            <Text style={styles.reviewQuestion}>Deneyiminiz nasıldı?</Text>
            <View accessibilityLabel={`${rating} yıldız seçildi`} style={styles.reviewStarRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  accessibilityLabel={`${star} yıldız`}
                  key={star}
                  onPress={() => setRating(star)}
                  style={styles.reviewStarButton}
                >
                  <Text style={[styles.reviewStar, star <= rating ? styles.reviewStarSelected : null]}>
                    {star <= rating ? "★" : "☆"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.reviewRatingText}>
              {rating === 0 ? "Bir yıldız puanı seçin" : `${rating} / 5`}
            </Text>

            <Text style={styles.reviewLabel}>Yorumunuz (isteğe bağlı)</Text>
            <TextInput
              maxLength={1000}
              multiline
              onChangeText={setComment}
              placeholder="Yemekler ve hizmet hakkındaki düşüncelerinizi paylaşabilirsiniz."
              style={styles.reviewInput}
              textAlignVertical="top"
              value={comment}
            />
            <Text style={styles.reviewCharacterCount}>{comment.length}/1000</Text>
          </ScrollView>

          <View style={styles.reviewFooter}>
            <Pressable disabled={isSaving} onPress={onClose} style={styles.reviewLaterButton}>
              <Text style={styles.reviewLaterText}>{afterPayment ? "Daha sonra" : "Vazgeç"}</Text>
            </Pressable>
            <Pressable
              disabled={isSaving || rating === 0}
              onPress={() => void onSubmit(rating, comment)}
              style={[styles.reviewSubmitButton, rating === 0 ? styles.disabled : null]}
            >
              {isSaving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.reviewSubmitText}>Değerlendirmeyi kaydet</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function ProductCustomizer({
  item,
  note,
  selectedOptionIds,
  onClose,
  onNoteChange,
  onSave,
  onToggleOption
}: {
  item: MenuItemDto | null;
  note: string;
  selectedOptionIds: Set<number>;
  onClose: () => void;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onToggleOption: (optionId: number) => void;
}) {
  const customizerScrollRef = useRef<ScrollView>(null);
  const selectedOptions = (item?.options ?? []).filter((option) => selectedOptionIds.has(option.id));
  const totalPrice = (item?.price ?? 0) + selectedOptions.reduce((sum, option) => sum + option.additionalPrice, 0);

  function revealNoteInput() {
    requestAnimationFrame(() => customizerScrollRef.current?.scrollToEnd({ animated: true }));
    setTimeout(() => customizerScrollRef.current?.scrollToEnd({ animated: true }), 300);
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={item !== null}
    >
      <SafeAreaView style={styles.customizerScreen}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.customizerKeyboard}
        >
          <View style={styles.customizerHeader}>
            <View style={styles.flex}>
              <Text style={styles.customizerTitle}>{item?.name}</Text>
              <Text style={styles.customizerPrice}>{formatCurrency(totalPrice)}</Text>
            </View>
            <Pressable accessibilityLabel="Kapat" onPress={onClose} style={styles.customizerClose}>
              <Text style={styles.customizerCloseText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            ref={customizerScrollRef}
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.customizerContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.customizerScroll}
          >
            {(item?.options ?? []).length > 0 ? (
              <View style={styles.optionList}>
                <Text style={styles.customizerLabel}>Ücretli ekstralar</Text>
                {(item?.options ?? []).map((option) => {
                  const selected = selectedOptionIds.has(option.id);
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => onToggleOption(option.id)}
                      style={[styles.optionRow, selected ? styles.optionRowSelected : null]}
                    >
                      <Text style={styles.optionCheck}>{selected ? "✓" : ""}</Text>
                      <Text style={styles.optionName}>{option.name}</Text>
                      <Text style={styles.optionPrice}>+{formatCurrency(option.additionalPrice)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <Text style={styles.customizerLabel}>Hazırlama notu</Text>
            <TextInput
              maxLength={300}
              multiline
              onChangeText={onNoteChange}
              onFocus={revealNoteInput}
              placeholder="Örn. acısız, az tuzlu, soğansız…"
              returnKeyType="default"
              style={styles.customizerNote}
              value={note}
            />
          </ScrollView>

          <View style={styles.customizerFooter}>
            <Pressable onPress={onClose} style={styles.customizerCancel}>
              <Text style={styles.customizerCancelText}>Vazgeç</Text>
            </Pressable>
            <Pressable onPress={onSave} style={styles.customizerSave}>
              <Text style={styles.customizerSaveText}>Sepete ekle</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function OrderPanel({
  order,
  realtimeStatus,
  isLoading,
  onRequestPayment,
  onStartNewOrder
}: {
  order: OrderDto;
  realtimeStatus: "idle" | "connecting" | "connected" | "fallback";
  isLoading: boolean;
  onRequestPayment: (method: PaymentMethod) => void;
  onStartNewOrder: () => void;
}) {
  const canRequestPayment = order.status === "Ready" && order.tableStatus !== "WaitingForPayment";
  const [isPaymentPickerOpen, setIsPaymentPickerOpen] = useState(false);

  function selectPaymentMethod(method: PaymentMethod) {
    setIsPaymentPickerOpen(false);
    onRequestPayment(method);
  }

  return (
    <View style={styles.panel}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Sipariş #{order.id}</Text>
          <Text style={styles.meta}>Masa {order.tableNumber}</Text>
          {order.status !== "Cancelled" ? (
            <Text style={[styles.realtimeText, realtimeStatus === "connected" ? styles.realtimeConnected : null]}>
              {realtimeStatus === "connected" ? "● Canlı takip bağlı" : "● Bağlantı kuruluyor · otomatik kontrol açık"}
            </Text>
          ) : null}
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{statusText(order.status)}</Text>
        </View>
      </View>

      {order.status === "Cancelled" ? (
        <View style={styles.cancelledPanel}>
          <Text style={styles.cancelledTitle}>Siparişiniz iptal edildi</Text>
          <Text style={styles.cancelledText}>Sebep: {order.cancellationReason || "Restoran tarafından iptal edildi."}</Text>
          <Pressable onPress={onStartNewOrder} style={styles.newOrderButton}>
            <Text style={styles.newOrderButtonText}>Yeni sipariş oluştur</Text>
          </Pressable>
        </View>
      ) : null}

      {order.items.map((item) => (
        <View key={item.id} style={styles.orderLine}>
          <View style={styles.flex}>
            <Text style={styles.itemName}>{item.menuItemName}</Text>
            <Text style={styles.meta}>
              {item.quantity} adet - {statusText(item.status)}
            </Text>
          </View>
          <Text style={styles.price}>{formatCurrency(item.quantity * item.unitPrice)}</Text>
        </View>
      ))}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Toplam</Text>
        <Text style={styles.totalValue}>{formatCurrency(order.totalAmount)}</Text>
      </View>

      {order.status !== "Cancelled" ? <Pressable
        disabled={isLoading || !canRequestPayment}
        onPress={() => setIsPaymentPickerOpen(true)}
        style={[styles.primaryButton, !canRequestPayment ? styles.disabled : null]}
      >
        <Text style={styles.primaryButtonText}>
          {order.tableStatus === "WaitingForPayment"
            ? "Hesap isteği gönderildi"
            : canRequestPayment
              ? "Hesap iste"
              : "Sipariş hazır olunca hesap isteyebilirsiniz"}
        </Text>
      </Pressable> : null}

      {isPaymentPickerOpen ? (
        <View style={styles.paymentPicker}>
          <Text style={styles.paymentPickerTitle}>Neyle ödeme yapmak istersiniz?</Text>
          <Text style={styles.paymentPickerHint}>Hesabınız kısa sürede gelecektir.</Text>
          <View style={styles.paymentOptions}>
            <Pressable onPress={() => selectPaymentMethod("Cash")} style={styles.paymentOption}>
              <Text style={styles.paymentOptionText}>Nakit</Text>
            </Pressable>
            <Pressable onPress={() => selectPaymentMethod("CreditCard")} style={styles.paymentOption}>
              <Text style={styles.paymentOptionText}>Kart</Text>
            </Pressable>
            <Pressable onPress={() => selectPaymentMethod("QrPayment")} style={styles.paymentOption}>
              <Text style={styles.paymentOptionText}>QR ödeme</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setIsPaymentPickerOpen(false)} style={styles.cancelPaymentOption}>
            <Text style={styles.cancelPaymentOptionText}>Vazgeç</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function formatCurrency(value: number) {
  return `${value.toFixed(2)} TL`;
}

function resolveImageUrl(imageUrl: string, apiBaseUrl: string) {
  try {
    return new URL(imageUrl, `${apiBaseUrl.replace(/\/$/, "")}/`).toString();
  } catch {
    return imageUrl;
  }
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    Pending: "Alındı",
    Preparing: "Hazırlanıyor",
    Ready: "Hazır",
    Delivered: "Teslim edildi",
    Cancelled: "İptal",
    Empty: "Boş",
    Occupied: "Dolu",
    WaitingForPayment: "Hesap bekliyor"
  };

  return labels[status] ?? status;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f6f8"
  },
  container: {
    gap: 16,
    padding: 18,
    paddingBottom: 40
  },
  header: {
    gap: 4,
    paddingTop: 8
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  kicker: {
    color: "#5d6673",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  title: {
    color: "#14171a",
    fontSize: 30,
    fontWeight: "800"
  },
  logoutButton: {
    backgroundColor: "#edf1f4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  logoutButtonText: {
    color: "#3b4a56",
    fontSize: 13,
    fontWeight: "800"
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#dce1e7",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  scannerPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#dce1e7",
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
    overflow: "hidden",
    padding: 14
  },
  scannerHeading: {
    gap: 4
  },
  scannerTitle: {
    color: "#14171a",
    fontSize: 21,
    fontWeight: "900"
  },
  scannerDescription: {
    color: "#62717c",
    fontSize: 13,
    lineHeight: 19
  },
  cameraFrame: {
    backgroundColor: "#101717",
    borderColor: "#c7d7d2",
    borderRadius: 13,
    borderWidth: 1,
    height: 350,
    overflow: "hidden"
  },
  camera: {
    flex: 1
  },
  cameraOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.18)",
    flex: 1,
    justifyContent: "center"
  },
  scanTarget: {
    borderColor: "#78e0b1",
    borderRadius: 18,
    borderWidth: 3,
    height: 220,
    width: 220
  },
  scannerHint: {
    color: "#62717c",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  permissionPanel: {
    alignItems: "center",
    backgroundColor: "#f4faf8",
    borderColor: "#cfe4dc",
    borderRadius: 12,
    borderWidth: 1,
    gap: 9,
    minHeight: 230,
    justifyContent: "center",
    padding: 22
  },
  permissionIcon: {
    color: "#146c5f",
    fontSize: 38,
    fontWeight: "900"
  },
  permissionTitle: {
    color: "#17473f",
    fontSize: 18,
    fontWeight: "900"
  },
  permissionText: {
    color: "#58726b",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center"
  },
  permissionHelp: {
    color: "#9b3d32",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "center"
  },
  loadingText: {
    color: "#315e56",
    fontSize: 13,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#edf2f4",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 43,
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: "#31475d",
    fontSize: 14,
    fontWeight: "800"
  },
  sessionCard: {
    alignItems: "center",
    backgroundColor: "#eaf7f1",
    borderColor: "#b9dfcf",
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 12
  },
  sessionCheck: {
    alignItems: "center",
    backgroundColor: "#168252",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  sessionCheckText: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900"
  },
  sessionRestaurant: {
    color: "#17473f",
    fontSize: 15,
    fontWeight: "900"
  },
  sessionTable: {
    color: "#58726b",
    fontSize: 12,
    marginTop: 2
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  flex: {
    flex: 1
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#146c5f",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center"
  },
  disabled: {
    backgroundColor: "#8b9aa8"
  },
  meta: {
    color: "#697582",
    fontSize: 13
  },
  realtimeText: {
    color: "#9a6b14",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4
  },
  realtimeConnected: {
    color: "#168252"
  },
  error: {
    color: "#b42318",
    fontSize: 13,
    fontWeight: "700"
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sectionTitle: {
    color: "#14171a",
    fontSize: 20,
    fontWeight: "800"
  },
  category: {
    gap: 8
  },
  categoryTitle: {
    color: "#26313d",
    fontSize: 17,
    fontWeight: "800"
  },
  menuItem: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dce1e7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
    padding: 12
  },
  menuImage: {
    borderRadius: 8,
    height: 72,
    width: 72
  },
  menuImagePlaceholder: {
    alignItems: "center",
    backgroundColor: "#eef3f5",
    borderRadius: 8,
    height: 72,
    justifyContent: "center",
    width: 72
  },
  menuImagePlaceholderText: {
    fontSize: 28
  },
  itemName: {
    color: "#14171a",
    fontSize: 15,
    fontWeight: "800"
  },
  itemDescription: {
    color: "#4d5965",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3
  },
  itemActions: {
    alignItems: "flex-end",
    gap: 8
  },
  price: {
    color: "#14171a",
    fontSize: 14,
    fontWeight: "800"
  },
  smallButton: {
    backgroundColor: "#e7f2ef",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  smallButtonText: {
    color: "#146c5f",
    fontSize: 13,
    fontWeight: "800"
  },
  favoriteButton: {
    alignItems: "center",
    backgroundColor: "#fff0ef",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 38
  },
  favoriteButtonText: {
    color: "#c0443a",
    fontSize: 20,
    fontWeight: "900"
  },
  cartPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#dce1e7",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  empty: {
    color: "#697582",
    fontSize: 14
  },
  cartLine: {
    alignItems: "center",
    borderBottomColor: "#edf0f3",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingBottom: 10
  },
  quantityActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  quantityButton: {
    alignItems: "center",
    backgroundColor: "#eef2f6",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  quantityText: {
    color: "#26313d",
    fontSize: 20,
    fontWeight: "800"
  },
  quantityValue: {
    color: "#14171a",
    fontSize: 15,
    fontWeight: "800",
    minWidth: 20,
    textAlign: "center"
  },
  cartDetail: {
    color: "#7a5e28",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3
  },
  editCustomization: {
    color: "#146c5f",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5
  },
  totalRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  totalLabel: {
    color: "#26313d",
    fontSize: 15,
    fontWeight: "700"
  },
  totalValue: {
    color: "#14171a",
    fontSize: 20,
    fontWeight: "900"
  },
  statusPill: {
    backgroundColor: "#e7f2ef",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  statusText: {
    color: "#146c5f",
    fontSize: 13,
    fontWeight: "800"
  },
  orderLine: {
    alignItems: "center",
    borderBottomColor: "#edf0f3",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingBottom: 10
  },
  paymentPicker: {
    backgroundColor: "#f0f7f5",
    borderColor: "#b7d8d0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  paymentPickerTitle: {
    color: "#17473f",
    fontSize: 16,
    fontWeight: "800"
  },
  paymentPickerHint: {
    color: "#4d6963",
    fontSize: 13
  },
  cancelledPanel: { backgroundColor: "#fff0ef", borderColor: "#f1bbb6", borderRadius: 8, borderWidth: 1, gap: 4, padding: 12 },
  cancelledTitle: { color: "#ad3024", fontSize: 15, fontWeight: "900" },
  cancelledText: { color: "#7d3a34", fontSize: 13 },
  newOrderButton: { alignItems: "center", backgroundColor: "#ad3024", borderRadius: 8, marginTop: 6, paddingVertical: 11 },
  newOrderButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  paymentOptions: {
    flexDirection: "row",
    gap: 8
  },
  paymentOption: {
    alignItems: "center",
    backgroundColor: "#146c5f",
    borderRadius: 8,
    flex: 1,
    paddingVertical: 10
  },
  paymentOptionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800"
  },
  cancelPaymentOption: {
    alignItems: "center",
    paddingVertical: 5
  },
  cancelPaymentOptionText: {
    color: "#52636d",
    fontSize: 13,
    fontWeight: "700"
  },
  bottomNavigation: {
    backgroundColor: "#ffffff",
    borderTopColor: "#dce1e7",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  bottomNavigationItem: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 45
  },
  bottomNavigationItemActive: {
    backgroundColor: "#146c5f"
  },
  bottomNavigationText: {
    color: "#62717c",
    fontSize: 13,
    fontWeight: "900"
  },
  bottomNavigationTextActive: {
    color: "#ffffff"
  },
  accountCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dce1e7",
    borderRadius: 14,
    borderWidth: 1,
    padding: 18
  },
  accountAvatar: {
    alignItems: "center",
    backgroundColor: "#dff2eb",
    borderRadius: 36,
    height: 72,
    justifyContent: "center",
    width: 72
  },
  accountAvatarText: {
    color: "#146c5f",
    fontSize: 30,
    fontWeight: "900"
  },
  accountName: {
    color: "#14171a",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 12
  },
  accountRole: {
    color: "#697582",
    fontSize: 13,
    marginTop: 3
  },
  accountDetails: {
    marginTop: 22,
    width: "100%"
  },
  accountInfoRow: {
    borderTopColor: "#edf0f3",
    borderTopWidth: 1,
    gap: 5,
    paddingVertical: 13
  },
  accountInfoLabel: {
    color: "#697582",
    fontSize: 12,
    fontWeight: "700"
  },
  accountInfoValue: {
    color: "#26313d",
    fontSize: 15,
    fontWeight: "800"
  },
  accountLogoutButton: {
    alignItems: "center",
    backgroundColor: "#b83a31",
    borderRadius: 9,
    marginTop: 18,
    minHeight: 47,
    justifyContent: "center",
    width: "100%"
  },
  accountLogoutText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  reviewScreen: {
    backgroundColor: "#f4f6f7",
    flex: 1
  },
  reviewKeyboard: {
    flex: 1
  },
  reviewHeader: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: "#dce3e5",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  reviewKicker: {
    color: "#b2780e",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  reviewTitle: {
    color: "#17212b",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 3
  },
  reviewClose: {
    alignItems: "center",
    backgroundColor: "#edf1f4",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  reviewCloseText: {
    color: "#34444b",
    fontSize: 28,
    lineHeight: 30
  },
  reviewContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 34
  },
  reviewThanks: {
    backgroundColor: "#edf8f4",
    borderRadius: 10,
    color: "#356459",
    fontSize: 13,
    lineHeight: 20,
    padding: 13
  },
  reviewQuestion: {
    color: "#17212b",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 22,
    textAlign: "center"
  },
  reviewStarRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 12
  },
  reviewStarButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    minWidth: 52
  },
  reviewStar: {
    color: "#b9c0c4",
    fontSize: 42
  },
  reviewStarSelected: {
    color: "#e39a14"
  },
  reviewRatingText: {
    color: "#697582",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center"
  },
  reviewLabel: {
    color: "#34444b",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 25
  },
  reviewInput: {
    backgroundColor: "#ffffff",
    borderColor: "#c8d3d5",
    borderRadius: 10,
    borderWidth: 1,
    color: "#17212b",
    minHeight: 130,
    marginTop: 8,
    padding: 12
  },
  reviewCharacterCount: {
    color: "#7b878d",
    fontSize: 11,
    marginTop: 5,
    textAlign: "right"
  },
  reviewFooter: {
    backgroundColor: "#ffffff",
    borderTopColor: "#dce3e5",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 12,
    paddingBottom: 16
  },
  reviewLaterButton: {
    alignItems: "center",
    backgroundColor: "#edf1f4",
    borderRadius: 9,
    flex: 1,
    justifyContent: "center",
    minHeight: 48
  },
  reviewLaterText: {
    color: "#4d5965",
    fontSize: 13,
    fontWeight: "900"
  },
  reviewSubmitButton: {
    alignItems: "center",
    backgroundColor: "#e39a14",
    borderRadius: 9,
    flex: 2,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 10
  },
  reviewSubmitText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  customizerScreen: {
    backgroundColor: "#f4f6f7",
    flex: 1
  },
  customizerKeyboard: {
    flex: 1
  },
  customizerHeader: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: "#dce3e5",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  customizerClose: {
    alignItems: "center",
    backgroundColor: "#edf1f4",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  customizerCloseText: {
    color: "#34444b",
    fontSize: 28,
    lineHeight: 30
  },
  customizerScroll: {
    flex: 1
  },
  customizerContent: {
    gap: 12,
    padding: 18,
    paddingBottom: 30
  },
  customizerTitle: {
    color: "#17212b",
    fontSize: 22,
    fontWeight: "900"
  },
  customizerPrice: {
    color: "#146c5f",
    fontSize: 18,
    fontWeight: "900"
  },
  customizerLabel: {
    color: "#34444b",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 5
  },
  optionList: {
    gap: 7
  },
  optionRow: {
    alignItems: "center",
    borderColor: "#d8e1df",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 45,
    paddingHorizontal: 11
  },
  optionRowSelected: {
    backgroundColor: "#edf8f4",
    borderColor: "#65af98"
  },
  optionCheck: {
    color: "#146c5f",
    fontSize: 16,
    fontWeight: "900",
    width: 18
  },
  optionName: {
    color: "#26313d",
    flex: 1,
    fontSize: 13,
    fontWeight: "800"
  },
  optionPrice: {
    color: "#146c5f",
    fontSize: 12,
    fontWeight: "900"
  },
  customizerNote: {
    backgroundColor: "#ffffff",
    borderColor: "#c8d3d5",
    borderRadius: 9,
    borderWidth: 1,
    minHeight: 130,
    padding: 11,
    textAlignVertical: "top"
  },
  customizerFooter: {
    backgroundColor: "#ffffff",
    borderTopColor: "#dce3e5",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 12,
    paddingBottom: 16
  },
  customizerCancel: {
    alignItems: "center",
    backgroundColor: "#edf1f4",
    borderRadius: 9,
    flex: 1,
    justifyContent: "center",
    minHeight: 46
  },
  customizerCancelText: {
    color: "#4d5965",
    fontSize: 13,
    fontWeight: "900"
  },
  customizerSave: {
    alignItems: "center",
    backgroundColor: "#146c5f",
    borderRadius: 9,
    flex: 1,
    justifyContent: "center",
    minHeight: 46
  },
  customizerSaveText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  }
});
