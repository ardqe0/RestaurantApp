import { StatusBar } from "expo-status-bar";
import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  adjustInventory,
  cancelOrder,
  createPayment,
  defaultApiBaseUrl,
  getActiveOrders,
  getActiveWaiterCalls,
  getCurrentUser,
  getInventory,
  resolveWaiterCall,
  setInventoryAvailability,
  setInventoryStock,
  signOut,
  splitPayment,
  updateItemStatus
} from "./src/api";
import type { InventoryItemDto, OrderDto, OrderItemDto, OrderItemStatus, PaymentDto, PaymentMethod, WaiterCallDto } from "./src/types";

const overdueWarningMinutes = 15;
const criticalWarningMinutes = 20;

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [waiterCalls, setWaiterCalls] = useState<WaiterCallDto[]>([]);
  const [inventory, setInventory] = useState<InventoryItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [payingOrderId, setPayingOrderId] = useState<number | null>(null);
  const [splittingOrderId, setSplittingOrderId] = useState<number | null>(null);
  const [resolvingWaiterCallId, setResolvingWaiterCallId] = useState<number | null>(null);
  const [updatingStockId, setUpdatingStockId] = useState<number | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newOrderNotice, setNewOrderNotice] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [blinkOn, setBlinkOn] = useState(false);
  const hasLoadedOrders = useRef(false);
  const seenOrderIds = useRef<Set<number>>(new Set());
  const overdueAlertedOrderIds = useRef<Set<number>>(new Set());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioEnabledRef = useRef(false);

  useEffect(() => {
    let isActive = true;
    getCurrentUser(apiBaseUrl)
      .then((user) => {
        if (isActive) setIsAuthenticated(user.role === "Kitchen");
      })
      .catch(() => {
        if (isActive) setIsAuthenticated(false);
      });

    return () => { isActive = false; };
  }, [apiBaseUrl]);

  const loadOrders = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    try {
      const [activeOrdersResponse, activeWaiterCalls, currentInventory] = await Promise.all([
        getActiveOrders(apiBaseUrl.trim()),
        getActiveWaiterCalls(apiBaseUrl.trim()),
        getInventory(apiBaseUrl.trim())
      ]);
      const activeOrders = [...activeOrdersResponse].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
      const newOrders = hasLoadedOrders.current
        ? activeOrders.filter((order) => !seenOrderIds.current.has(order.id))
        : [];
      const currentTime = Date.now();
      const newlyOverdueOrders = activeOrders.filter((order) => {
        const waitingMinutes = getWaitingMinutes(order.createdAt, currentTime);
        return isKitchenOrderWaiting(order)
          && waitingMinutes >= criticalWarningMinutes
          && !overdueAlertedOrderIds.current.has(order.id);
      });

      seenOrderIds.current = new Set(activeOrders.map((order) => order.id));
      hasLoadedOrders.current = true;
      newlyOverdueOrders.forEach((order) => overdueAlertedOrderIds.current.add(order.id));
      setOrders(activeOrders);
      setWaiterCalls(activeWaiterCalls);
      setInventory(currentInventory);
      setClock(currentTime);
      setError(null);

      if (newOrders.length > 0) {
        const tables = newOrders.map((order) => `Masa ${order.tableNumber}`).join(", ");
        setNewOrderNotice(`${newOrders.length} yeni sipariş geldi · ${tables}`);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNewOrderNotice(null), 8_000);
        if (audioEnabledRef.current && audioContext.current) {
          playWebAlert(audioContext.current, "new");
        }
      }

      if (newlyOverdueOrders.length > 0 && audioEnabledRef.current && audioContext.current) {
        playWebAlert(audioContext.current, "overdue");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Siparişler yüklenemedi.");
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (isAuthenticated !== true) return;

    const timer = setInterval(() => void loadOrders(false), 4000);
    const clockTimer = setInterval(() => setClock(Date.now()), 30_000);
    const blinkTimer = setInterval(() => setBlinkOn((current) => !current), 650);
    return () => {
      clearInterval(timer);
      clearInterval(clockTimer);
      clearInterval(blinkTimer);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [isAuthenticated, loadOrders]);

  useEffect(() => {
    if (isAuthenticated !== true) return;

    const baseUrl = apiBaseUrl.trim();
    if (!baseUrl) return;

    const connection = new HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/orders`, { withCredentials: true })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    const refreshFromEvent = () => void loadOrders(false);
    connection.on("NewOrder", refreshFromEvent);
    connection.on("OrderStatusChanged", refreshFromEvent);
    connection.on("OrderItemStatusChanged", refreshFromEvent);
    connection.on("PaymentStatusChanged", refreshFromEvent);
    connection.on("WaiterCallCreated", refreshFromEvent);
    connection.on("WaiterCallResolved", refreshFromEvent);
    connection.on("MenuStockChanged", refreshFromEvent);

    connection.start()
      .then(() => void loadOrders(false))
      .catch(() => {
        // Polling continues to keep the screen usable if SignalR cannot connect.
      });

    return () => {
      connection.off("NewOrder", refreshFromEvent);
      connection.off("OrderStatusChanged", refreshFromEvent);
      connection.off("OrderItemStatusChanged", refreshFromEvent);
      connection.off("PaymentStatusChanged", refreshFromEvent);
      connection.off("WaiterCallCreated", refreshFromEvent);
      connection.off("WaiterCallResolved", refreshFromEvent);
      connection.off("MenuStockChanged", refreshFromEvent);
      if (connection.state !== HubConnectionState.Disconnected) {
        void connection.stop();
      }
    };
  }, [apiBaseUrl, isAuthenticated, loadOrders]);

  if (isAuthenticated === null) {
    return <SafeAreaView style={styles.loginSafeArea}><ActivityIndicator size="large" color="#ffffff" /></SafeAreaView>;
  }

  if (!isAuthenticated) {
    return <KitchenLoginRequired />;
  }

  async function changeItemStatus(itemId: number, status: OrderItemStatus) {
    setUpdatingItemId(itemId);
    try {
      await updateItemStatus(apiBaseUrl.trim(), itemId, status);
      await loadOrders(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kalem durumu güncellenemedi.");
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function takePayment(orderId: number, method: PaymentMethod, paymentId?: number) {
    setPayingOrderId(orderId);
    try {
      await createPayment(apiBaseUrl.trim(), orderId, method, paymentId);
      await loadOrders(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ödeme alınamadı.");
    } finally {
      setPayingOrderId(null);
    }
  }

  async function changePaymentSplit(orderId: number, splitCount: number) {
    setSplittingOrderId(orderId);
    try {
      await splitPayment(apiBaseUrl.trim(), orderId, splitCount);
      await loadOrders(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adisyon bölünemedi.");
    } finally {
      setSplittingOrderId(null);
    }
  }

  async function confirmCancellation() {
    if (!cancellingOrderId || !cancellationReason.trim()) return;
    try {
      await cancelOrder(apiBaseUrl.trim(), cancellingOrderId, cancellationReason.trim());
      setCancellingOrderId(null);
      setCancellationReason("");
      await loadOrders(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sipariş iptal edilemedi.");
    }
  }

  async function markWaiterCallResolved(id: number) {
    setResolvingWaiterCallId(id);
    try {
      await resolveWaiterCall(apiBaseUrl.trim(), id);
      await loadOrders(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Garson çağrısı kapatılamadı.");
    } finally {
      setResolvingWaiterCallId(null);
    }
  }

  async function enableSound() {
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      setError("Tarayıcınız sesli mutfak uyarılarını desteklemiyor.");
      return;
    }

    const context = audioContext.current ?? new AudioContextClass();
    audioContext.current = context;
    if (context.state === "suspended") await context.resume();
    audioEnabledRef.current = true;
    setAudioEnabled(true);
    playWebAlert(context, criticalOrderCount > 0 ? "overdue" : "new");
  }

  async function logout() {
    try {
      await signOut(apiBaseUrl);
    } catch {
      // Local navigation still removes the user from the protected screen.
    }

    if (typeof window !== "undefined") {
      window.location.href = "http://localhost:5223";
    }
  }

  const pendingCount = orders.flatMap((order) => order.items).filter((item) => item.status === "Pending").length;
  const preparingCount = orders.flatMap((order) => order.items).filter((item) => item.status === "Preparing").length;
  const criticalOrderCount = orders.filter(
    (order) => isKitchenOrderWaiting(order)
      && getWaitingMinutes(order.createdAt, clock) >= criticalWarningMinutes
  ).length;
  const lowStockCount = inventory.filter((item) => item.stockQuantity <= 10).length;

  async function runStockAction(
    itemId: number,
    action: () => Promise<InventoryItemDto>
  ) {
    setUpdatingStockId(itemId);
    try {
      const updated = await action();
      setInventory((current) => current
        .map((item) => item.id === updated.id ? updated : item)
        .sort((left, right) => left.stockQuantity - right.stockQuantity || left.name.localeCompare(right.name)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stok güncellenemedi.");
    } finally {
      setUpdatingStockId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Mutfak ekranı</Text>
          <Text style={styles.title}>Aktif siparişler</Text>
          <Text style={styles.subtitle}>Yeni siparişler otomatik olarak 4 saniyede bir yenilenir.</Text>
        </View>

        <Pressable onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutButtonText}>Çıkış yap</Text>
        </Pressable>

        <View style={styles.panel}>
          <Text style={styles.label}>API adresi</Text>
          <View style={styles.row}>
            <TextInput autoCapitalize="none" value={apiBaseUrl} onChangeText={setApiBaseUrl} style={[styles.input, styles.flex]} />
            <Pressable onPress={() => void loadOrders()} style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>{isLoading ? "..." : "Yenile"}</Text>
            </Pressable>
          </View>
          <Pressable
            disabled={audioEnabled}
            onPress={() => void enableSound()}
            style={[styles.soundButton, audioEnabled ? styles.soundButtonEnabled : null]}
          >
            <Text style={styles.soundButtonText}>
              {audioEnabled ? "✓ Sipariş sesleri açık" : "🔔 Sipariş seslerini etkinleştir"}
            </Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {newOrderNotice ? (
          <View style={styles.newOrderBanner}>
            <Text style={styles.newOrderBannerIcon}>●</Text>
            <View style={styles.flex}>
              <Text style={styles.newOrderBannerTitle}>Yeni sipariş</Text>
              <Text style={styles.newOrderBannerText}>{newOrderNotice}</Text>
            </View>
          </View>
        ) : null}

        {criticalOrderCount > 0 ? (
          <View style={[styles.criticalSummary, blinkOn ? styles.criticalSummaryBlink : null]}>
            <Text style={styles.criticalSummaryText}>
              ⚠ {criticalOrderCount} sipariş 20 dakikadan uzun süredir bekliyor
            </Text>
          </View>
        ) : null}

        <View style={styles.inventoryPanel}>
          <View style={styles.inventoryHeader}>
            <View style={styles.flex}>
              <Text style={styles.inventoryTitle}>Hızlı stok yönetimi</Text>
              <Text style={styles.inventoryHint}>
                {lowStockCount > 0 ? `${lowStockCount} ürün için stok uyarısı var.` : "Stok seviyeleri normal."}
              </Text>
            </View>
            {lowStockCount > 0 ? (
              <View style={styles.inventoryWarningBadge}>
                <Text style={styles.inventoryWarningBadgeText}>{lowStockCount}</Text>
              </View>
            ) : null}
          </View>
          {inventory.map((item) => {
            const isUpdatingStock = updatingStockId === item.id;
            const isCriticalStock = item.stockQuantity <= 5;
            const isLowStock = item.stockQuantity > 5 && item.stockQuantity <= 10;
            return (
              <View
                key={item.id}
                style={[
                  styles.inventoryRow,
                  isLowStock ? styles.inventoryRowLow : null,
                  isCriticalStock ? styles.inventoryRowCritical : null
                ]}
              >
                <View style={styles.flex}>
                  <Text style={styles.inventoryItemName}>{item.name}</Text>
                  <Text style={styles.inventoryItemMeta}>
                    {item.categoryName} · Stok: {item.stockQuantity} · {item.isAvailable ? "Satışta" : "Satışta değil"}
                  </Text>
                </View>
                <View style={styles.inventoryActions}>
                  <Pressable
                    disabled={isUpdatingStock}
                    onPress={() => void runStockAction(item.id, () => adjustInventory(apiBaseUrl.trim(), item.id, 1))}
                    style={[styles.inventoryActionButton, isUpdatingStock ? styles.disabled : null]}
                  >
                    <Text style={styles.inventoryActionText}>+1</Text>
                  </Pressable>
                  <Pressable
                    disabled={isUpdatingStock}
                    onPress={() => void runStockAction(item.id, () => adjustInventory(apiBaseUrl.trim(), item.id, 5))}
                    style={[styles.inventoryActionButton, isUpdatingStock ? styles.disabled : null]}
                  >
                    <Text style={styles.inventoryActionText}>+5</Text>
                  </Pressable>
                  <Pressable
                    disabled={isUpdatingStock}
                    onPress={() => void runStockAction(
                      item.id,
                      () => item.isAvailable
                        ? setInventoryStock(apiBaseUrl.trim(), item.id, 0)
                        : item.stockQuantity > 0
                          ? setInventoryAvailability(apiBaseUrl.trim(), item.id, true)
                          : adjustInventory(apiBaseUrl.trim(), item.id, 1)
                    )}
                    style={[
                      styles.inventoryAvailabilityButton,
                      !item.isAvailable ? styles.inventoryOpenButton : null,
                      isUpdatingStock ? styles.disabled : null
                    ]}
                  >
                    <Text style={styles.inventoryAvailabilityText}>
                      {isUpdatingStock ? "…" : item.isAvailable ? "Tükendi" : "Satışa aç"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        {waiterCalls.length > 0 ? (
          <View style={styles.waiterCallsPanel}>
            <View style={styles.waiterCallsHeader}>
              <Text style={styles.waiterCallsTitle}>Garson çağrıları</Text>
              <View style={styles.waiterCallsCount}>
                <Text style={styles.waiterCallsCountText}>{waiterCalls.length}</Text>
              </View>
            </View>
            {waiterCalls.map((call) => (
              <View key={call.id} style={styles.waiterCallRow}>
                <View style={styles.flex}>
                  <Text style={styles.waiterCallTable}>Masa {call.tableNumber}</Text>
                  <Text style={styles.waiterCallTime}>{timeText(call.createdAt)} saatinde çağırdı</Text>
                </View>
                <Pressable
                  disabled={resolvingWaiterCallId === call.id}
                  onPress={() => void markWaiterCallResolved(call.id)}
                  style={[styles.waiterCallResolveButton, resolvingWaiterCallId === call.id ? styles.disabled : null]}
                >
                  <Text style={styles.waiterCallResolveText}>
                    {resolvingWaiterCallId === call.id ? "İşleniyor…" : "İlgilenildi"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.stats}>
          <Stat label="Sipariş" value={orders.length} />
          <Stat label="Bekleyen kalem" value={pendingCount} />
          <Stat label="Hazırlanıyor" value={preparingCount} />
        </View>

        {isLoading && orders.length === 0 ? <ActivityIndicator size="large" color="#f7b733" /> : null}
        {!isLoading && orders.length === 0 ? <Text style={styles.empty}>Aktif sipariş yok.</Text> : null}

        {orders.map((order) => {
          const waitingMinutes = getWaitingMinutes(order.createdAt, clock);
          const isWaiting = isKitchenOrderWaiting(order);
          const isCritical = isWaiting && waitingMinutes >= criticalWarningMinutes;
          const isOverdue = isWaiting && waitingMinutes >= overdueWarningMinutes;
          return (
          <View
            key={order.id}
            style={[
              styles.orderCard,
              isOverdue ? styles.overdueOrderCard : null,
              isCritical ? styles.criticalOrderCard : null,
              isCritical && blinkOn ? styles.criticalOrderCardBlink : null
            ]}
          >
            <View style={styles.orderHeader}>
              <View>
                <Text style={styles.tableTitle}>Masa {order.tableNumber}</Text>
                <Text style={styles.orderMeta}>Sipariş #{order.id} · {timeText(order.createdAt)}</Text>
                {isWaiting ? <Text style={[
                  styles.waitingTime,
                  isOverdue ? styles.waitingTimeOverdue : null,
                  isCritical ? styles.waitingTimeCritical : null
                ]}>
                  {waitingMinutes} dakikadır bekliyor
                </Text> : null}
              </View>
              <View style={[styles.statusPill, order.status === "Ready" ? styles.readyPill : null]}>
                <Text style={styles.statusText}>{orderStatusText(order.status)}</Text>
              </View>
            </View>

            {order.items.map((item) => (
              <OrderItemRow key={item.id} item={item} isUpdating={updatingItemId === item.id} onUpdate={changeItemStatus} />
            ))}
            {order.status === "Ready" && order.tableStatus === "WaitingForPayment" && order.requestedPaymentMethod ? (
              <PaymentActions orderId={order.id} method={order.requestedPaymentMethod} payments={order.payments ?? []} isPaying={payingOrderId === order.id} isSplitting={splittingOrderId === order.id} onPayment={takePayment} onSplit={changePaymentSplit} />
            ) : null}
            <Pressable onPress={() => { setCancellingOrderId(order.id); setCancellationReason(""); }} style={styles.cancelOrderButton}>
              <Text style={styles.cancelOrderButtonText}>Siparişi iptal et</Text>
            </Pressable>
          </View>
          );
        })}
        {cancellingOrderId ? (
          <View style={styles.cancelModalBackdrop}><View style={styles.cancelModal}><Text style={styles.cancelModalTitle}>Sipariş iptal edilecek</Text><Text style={styles.cancelModalHint}>Lütfen iptal sebebini girin.</Text><TextInput autoFocus multiline value={cancellationReason} onChangeText={setCancellationReason} placeholder="İptal sebebi" style={styles.cancelReasonInput} /><View style={styles.cancelModalActions}><Pressable onPress={() => { setCancellingOrderId(null); setCancellationReason(""); }} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Vazgeç</Text></Pressable><Pressable disabled={!cancellationReason.trim()} onPress={() => void confirmCancellation()} style={[styles.cancelConfirmButton, !cancellationReason.trim() ? styles.disabled : null]}><Text style={styles.cancelConfirmButtonText}>İptal et</Text></Pressable></View></View></View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function KitchenLoginRequired() {
  function goToLogin() {
    if (typeof window !== "undefined") {
      window.location.href = "http://localhost:5223";
    }
  }

  return (
    <SafeAreaView style={styles.loginSafeArea}>
      <StatusBar style="light" />
      <View style={styles.loginPanel}>
        <Text style={styles.kicker}>Mutfak ekranı</Text>
        <Text style={styles.loginTitle}>Giriş gerekli</Text>
        <Text style={styles.loginText}>Mutfak siparişlerine erişmek için ana sayfadan mutfak hesabınızla giriş yapın.</Text>
        <Pressable onPress={goToLogin} style={styles.loginButton}>
          <Text style={styles.loginButtonText}>Ana sayfaya git</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function OrderItemRow({ item, isUpdating, onUpdate }: { item: OrderItemDto; isUpdating: boolean; onUpdate: (id: number, status: OrderItemStatus) => Promise<void> }) {
  const action = item.status === "Pending" ? { label: "Hazırlamaya al", status: "Preparing" as const } : item.status === "Preparing" ? { label: "Hazır", status: "Ready" as const } : null;
  return (
    <View style={styles.itemRow}>
      <View style={styles.flex}>
        <Text style={styles.itemName}>{item.quantity}× {item.menuItemName}</Text>
        {item.note ? <Text style={styles.note}>Not: {item.note}</Text> : null}
        <Text style={styles.itemStatus}>{itemStatusText(item.status)}</Text>
      </View>
      {action ? (
        <Pressable disabled={isUpdating} onPress={() => void onUpdate(item.id, action.status)} style={[styles.actionButton, isUpdating ? styles.disabled : null]}>
          <Text style={styles.actionButtonText}>{isUpdating ? "..." : action.label}</Text>
        </Pressable>
      ) : <Text style={styles.done}>Tamam</Text>}
    </View>
  );
}

function PaymentActions({ orderId, method, payments, isPaying, isSplitting, onPayment, onSplit }: { orderId: number; method: PaymentMethod; payments: PaymentDto[]; isPaying: boolean; isSplitting: boolean; onPayment: (orderId: number, method: PaymentMethod, paymentId?: number) => Promise<void>; onSplit: (orderId: number, splitCount: number) => Promise<void> }) {
  const canChangeSplit = !payments.some((payment) => payment.status === "Completed");

  return (
    <View style={styles.paymentPanel}>
      <Text style={styles.paymentTitle}>Müşterinin seçtiği ödeme yöntemi: {paymentMethodText(method)}</Text>
      <Text style={styles.paymentHint}>{payments.length > 1 ? `Adisyon ${payments.length} parçaya bölündü.` : "Tek adisyon"} · Tüm parçalar ödenince masa boşalır.</Text>
      {canChangeSplit ? (
        <View style={styles.splitPanel}>
          <Text style={styles.splitTitle}>Adisyonu böl</Text>
          <View style={styles.splitActions}>
            {[2, 3, 4].map((splitCount) => (
              <Pressable
                key={splitCount}
                disabled={isPaying || isSplitting || payments.length === splitCount}
                onPress={() => void onSplit(orderId, splitCount)}
                style={[
                  styles.splitButton,
                  payments.length === splitCount ? styles.splitButtonSelected : null,
                  (isPaying || isSplitting) ? styles.disabled : null
                ]}
              >
                <Text style={styles.splitButtonText}>{payments.length === splitCount ? `✓ ${splitCount} parça` : `${splitCount} parçaya böl`}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.paymentActions}>
        {(payments.length ? payments : [{ id: 0, amount: 0, status: "Pending", method } as PaymentDto]).map((payment, index) => (
          <PaymentButton
            key={payment.id || index}
            label={payment.status === "Completed" ? `${index + 1}. parça ödendi` : payments.length > 1 ? `${index + 1}. parça · ${payment.amount.toFixed(2)} TL` : "Müşteriden ödeme alındı"}
            method={payment.method}
            paymentId={payment.id || undefined}
            disabled={isPaying || isSplitting || payment.status === "Completed"}
            orderId={orderId}
            onPayment={onPayment}
          />
        ))}
      </View>
    </View>
  );
}

function PaymentButton({ label, method, paymentId, disabled, orderId, onPayment }: { label: string; method: PaymentMethod; paymentId?: number; disabled: boolean; orderId: number; onPayment: (orderId: number, method: PaymentMethod, paymentId?: number) => Promise<void> }) {
  return (
    <Pressable disabled={disabled} onPress={() => void onPayment(orderId, method, paymentId)} style={[styles.paymentButton, disabled ? styles.disabled : null]}>
      <Text style={styles.paymentButtonText}>{label}</Text>
    </Pressable>
  );
}

function orderStatusText(status: string) {
  return ({ Pending: "Yeni", Preparing: "Hazırlanıyor", Ready: "Hazır", Cancelled: "İptal edildi" } as Record<string, string>)[status] ?? status;
}

function itemStatusText(status: string) {
  return ({ Pending: "Bekliyor", Preparing: "Hazırlanıyor", Ready: "Hazır" } as Record<string, string>)[status] ?? status;
}

function paymentMethodText(method: PaymentMethod) {
  return ({ Cash: "Nakit", CreditCard: "Kart", QrPayment: "QR ödeme" } as Record<PaymentMethod, string>)[method];
}

function timeText(value: string) {
  return new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function getWaitingMinutes(value: string, currentTime = Date.now()) {
  const createdAt = new Date(value).getTime();
  if (Number.isNaN(createdAt)) return 0;
  return Math.max(0, Math.floor((currentTime - createdAt) / 60_000));
}

function isKitchenOrderWaiting(order: OrderDto) {
  return order.status === "Pending" || order.status === "Preparing";
}

function playWebAlert(context: AudioContext, kind: "new" | "overdue") {
  const frequencies = kind === "new" ? [880, 1175] : [660, 520, 660];
  frequencies.forEach((frequency, index) => {
    const startAt = context.currentTime + index * 0.22;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "new" ? "sine" : "square";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.17);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.18);
  });
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#17212b" },
  loginSafeArea: { alignItems: "center", backgroundColor: "#17212b", flex: 1, justifyContent: "center", padding: 20 },
  loginPanel: { backgroundColor: "#fff", borderRadius: 12, gap: 12, maxWidth: 420, padding: 24, width: "100%" },
  loginTitle: { color: "#17212b", fontSize: 27, fontWeight: "900" },
  loginText: { color: "#52636d", fontSize: 15, lineHeight: 22 },
  loginButton: { alignItems: "center", backgroundColor: "#178251", borderRadius: 8, marginTop: 4, paddingVertical: 13 },
  loginButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  container: { backgroundColor: "#17212b", gap: 16, minHeight: "100%", padding: 18, paddingBottom: 36 },
  header: { gap: 4, paddingTop: 8 }, kicker: { color: "#f7b733", fontSize: 13, fontWeight: "800", textTransform: "uppercase" }, title: { color: "#fff", fontSize: 30, fontWeight: "900" }, subtitle: { color: "#b8c6d1", fontSize: 14 }, logoutButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#31475d", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 }, logoutButtonText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  panel: { backgroundColor: "#fff", borderRadius: 10, gap: 8, padding: 12 }, label: { color: "#344050", fontSize: 13, fontWeight: "800" }, row: { alignItems: "center", flexDirection: "row", gap: 8 }, flex: { flex: 1 }, input: { borderColor: "#cbd5df", borderRadius: 8, borderWidth: 1, color: "#18212b", minHeight: 44, paddingHorizontal: 10 }, refreshButton: { backgroundColor: "#253b53", borderRadius: 8, minHeight: 44, justifyContent: "center", paddingHorizontal: 14 }, refreshButtonText: { color: "#fff", fontWeight: "800" }, error: { color: "#b42318", fontWeight: "700" },
  soundButton: { alignItems: "center", backgroundColor: "#f7b733", borderRadius: 8, justifyContent: "center", minHeight: 42, paddingHorizontal: 12 }, soundButtonEnabled: { backgroundColor: "#d8f3e7" }, soundButtonText: { color: "#28351d", fontSize: 13, fontWeight: "900" },
  newOrderBanner: { alignItems: "center", backgroundColor: "#dcfce7", borderColor: "#22c55e", borderRadius: 10, borderWidth: 2, flexDirection: "row", gap: 11, padding: 13 }, newOrderBannerIcon: { color: "#16a34a", fontSize: 24 }, newOrderBannerTitle: { color: "#14532d", fontSize: 17, fontWeight: "900" }, newOrderBannerText: { color: "#166534", fontSize: 13, fontWeight: "700", marginTop: 2 },
  criticalSummary: { backgroundColor: "#991b1b", borderRadius: 10, padding: 12 }, criticalSummaryBlink: { backgroundColor: "#ef4444" }, criticalSummaryText: { color: "#fff", fontSize: 14, fontWeight: "900", textAlign: "center" },
  inventoryPanel: { backgroundColor: "#253b53", borderRadius: 10, gap: 8, padding: 12 },
  inventoryHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
  inventoryTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  inventoryHint: { color: "#b8c6d1", fontSize: 12, marginTop: 2 },
  inventoryWarningBadge: { alignItems: "center", backgroundColor: "#dc2626", borderRadius: 16, height: 32, justifyContent: "center", minWidth: 32, paddingHorizontal: 8 },
  inventoryWarningBadgeText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  inventoryRow: { alignItems: "center", backgroundColor: "#fff", borderRadius: 8, flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 10 },
  inventoryRowLow: { backgroundColor: "#fff7d6", borderColor: "#eab308", borderWidth: 2 },
  inventoryRowCritical: { backgroundColor: "#fee2e2", borderColor: "#dc2626", borderWidth: 2 },
  inventoryItemName: { color: "#17212b", fontSize: 14, fontWeight: "900" },
  inventoryItemMeta: { color: "#667788", fontSize: 11, marginTop: 2 },
  inventoryActions: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  inventoryActionButton: { backgroundColor: "#31475d", borderRadius: 7, minWidth: 42, paddingHorizontal: 8, paddingVertical: 8 },
  inventoryActionText: { color: "#fff", fontSize: 12, fontWeight: "900", textAlign: "center" },
  inventoryAvailabilityButton: { backgroundColor: "#b83a31", borderRadius: 7, minWidth: 74, paddingHorizontal: 8, paddingVertical: 8 },
  inventoryOpenButton: { backgroundColor: "#178251" },
  inventoryAvailabilityText: { color: "#fff", fontSize: 11, fontWeight: "900", textAlign: "center" },
  waiterCallsPanel: { backgroundColor: "#fff4d8", borderColor: "#efc86c", borderRadius: 10, borderWidth: 1, gap: 8, padding: 12 }, waiterCallsHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, waiterCallsTitle: { color: "#674600", fontSize: 18, fontWeight: "900" }, waiterCallsCount: { alignItems: "center", backgroundColor: "#d97706", borderRadius: 14, height: 28, justifyContent: "center", minWidth: 28, paddingHorizontal: 7 }, waiterCallsCountText: { color: "#fff", fontSize: 13, fontWeight: "900" }, waiterCallRow: { alignItems: "center", backgroundColor: "#fff", borderRadius: 8, flexDirection: "row", gap: 10, padding: 11 }, waiterCallTable: { color: "#17212b", fontSize: 17, fontWeight: "900" }, waiterCallTime: { color: "#75623a", fontSize: 12, marginTop: 2 }, waiterCallResolveButton: { backgroundColor: "#178251", borderRadius: 8, minWidth: 104, paddingHorizontal: 11, paddingVertical: 10 }, waiterCallResolveText: { color: "#fff", fontSize: 12, fontWeight: "900", textAlign: "center" },
  stats: { flexDirection: "row", gap: 8 }, stat: { backgroundColor: "#253b53", borderRadius: 10, flex: 1, gap: 3, padding: 12 }, statValue: { color: "#fff", fontSize: 24, fontWeight: "900" }, statLabel: { color: "#b8c6d1", fontSize: 12, fontWeight: "700" }, empty: { color: "#b8c6d1", textAlign: "center" },
  orderCard: { backgroundColor: "#fff", borderRadius: 10, gap: 8, padding: 14 }, overdueOrderCard: { backgroundColor: "#fff8e7", borderColor: "#f59e0b", borderWidth: 2 }, criticalOrderCard: { backgroundColor: "#fff1f2", borderColor: "#dc2626", borderWidth: 3 }, criticalOrderCardBlink: { backgroundColor: "#fecaca", borderColor: "#ff0000" }, orderHeader: { alignItems: "center", borderBottomColor: "#e7edf2", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 10 }, tableTitle: { color: "#17212b", fontSize: 21, fontWeight: "900" }, orderMeta: { color: "#667788", fontSize: 13, marginTop: 2 }, waitingTime: { color: "#178251", fontSize: 12, fontWeight: "800", marginTop: 4 }, waitingTimeOverdue: { color: "#b45309" }, waitingTimeCritical: { color: "#b91c1c", fontSize: 13, fontWeight: "900" }, statusPill: { backgroundColor: "#fff3cf", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }, readyPill: { backgroundColor: "#d8f3e7" }, statusText: { color: "#805900", fontSize: 12, fontWeight: "800" },
  itemRow: { alignItems: "center", borderBottomColor: "#edf1f4", borderBottomWidth: 1, flexDirection: "row", gap: 10, paddingVertical: 9 }, itemName: { color: "#17212b", fontSize: 16, fontWeight: "800" }, note: { color: "#9b5a00", fontSize: 13, marginTop: 2 }, itemStatus: { color: "#667788", fontSize: 12, marginTop: 4 }, actionButton: { backgroundColor: "#e36b36", borderRadius: 8, minWidth: 105, paddingHorizontal: 10, paddingVertical: 10 }, actionButtonText: { color: "#fff", fontSize: 12, fontWeight: "900", textAlign: "center" }, done: { color: "#178251", fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.55 }
  ,paymentPanel: { backgroundColor: "#eef8f2", borderRadius: 8, gap: 5, marginTop: 4, padding: 10 }, paymentTitle: { color: "#17633f", fontSize: 14, fontWeight: "900" }, paymentHint: { color: "#416451", fontSize: 12 }, splitPanel: { gap: 6, marginTop: 4 }, splitTitle: { color: "#284d3a", fontSize: 12, fontWeight: "800" }, splitActions: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, splitButton: { backgroundColor: "#dcebe3", borderRadius: 7, minWidth: 110, paddingHorizontal: 9, paddingVertical: 9 }, splitButtonSelected: { backgroundColor: "#9fd6b9" }, splitButtonText: { color: "#175b3a", fontSize: 11, fontWeight: "900", textAlign: "center" }, paymentActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 3 }, paymentButton: { backgroundColor: "#178251", borderRadius: 7, flexGrow: 1, minWidth: 180, paddingVertical: 9 }, paymentButtonText: { color: "#fff", fontSize: 12, fontWeight: "900", textAlign: "center" }, cancelOrderButton: { backgroundColor: "#b83a31", borderRadius: 8, marginTop: 8, paddingVertical: 10 }, cancelOrderButtonText: { color: "#fff", fontSize: 13, fontWeight: "900", textAlign: "center" }, cancelModalBackdrop: { alignItems: "center", backgroundColor: "#0008", bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0, zIndex: 10 }, cancelModal: { backgroundColor: "#fff", borderRadius: 12, gap: 10, maxWidth: 430, padding: 18, width: "92%" }, cancelModalTitle: { color: "#17212b", fontSize: 18, fontWeight: "900" }, cancelModalHint: { color: "#667788", fontSize: 13 }, cancelReasonInput: { borderColor: "#cbd5df", borderRadius: 8, borderWidth: 1, minHeight: 80, padding: 10 }, cancelModalActions: { flexDirection: "row", gap: 8 }, secondaryButton: { backgroundColor: "#31475d", borderRadius: 8, flex: 1, paddingVertical: 10 }, secondaryButtonText: { color: "#fff", fontWeight: "800", textAlign: "center" }, cancelConfirmButton: { backgroundColor: "#b83a31", borderRadius: 8, flex: 1, paddingVertical: 10 }, cancelConfirmButtonText: { color: "#fff", fontWeight: "800", textAlign: "center" }
});
