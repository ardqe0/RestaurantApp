import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { getAccessToken } from "./auth";
import {
  cancelOrder,
  createPayment,
  getActiveOrders,
  getActiveWaiterCalls,
  resolveWaiterCall,
  splitPayment,
  updateItemStatus
} from "./kitchenApi";
import { showKitchenAlertNotification } from "./notifications";
import type { OrderDto, OrderItemDto, OrderItemStatus, PaymentDto, PaymentMethod, WaiterCallDto } from "./types";

const overdueWarningMinutes = 15;
const criticalWarningMinutes = 20;

type KitchenScreenProps = {
  apiBaseUrl: string;
  username: string;
  onLogout: () => void | Promise<void>;
};

export function KitchenScreen({ apiBaseUrl, username, onLogout }: KitchenScreenProps) {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [waiterCalls, setWaiterCalls] = useState<WaiterCallDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [payingOrderId, setPayingOrderId] = useState<number | null>(null);
  const [splittingOrderId, setSplittingOrderId] = useState<number | null>(null);
  const [resolvingWaiterCallId, setResolvingWaiterCallId] = useState<number | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newOrderNotice, setNewOrderNotice] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [blinkOn, setBlinkOn] = useState(false);
  const hasLoadedOrders = useRef(false);
  const seenOrderIds = useRef<Set<number>>(new Set());
  const overdueAlertedOrderIds = useRef<Set<number>>(new Set());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadOrders = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    try {
      const [nextOrders, nextWaiterCalls] = await Promise.all([
        getActiveOrders(apiBaseUrl),
        getActiveWaiterCalls(apiBaseUrl)
      ]);
      const sortedOrders = [...nextOrders].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
      const newOrders = hasLoadedOrders.current
        ? sortedOrders.filter((order) => !seenOrderIds.current.has(order.id))
        : [];
      const currentTime = Date.now();
      const newlyOverdueOrders = sortedOrders.filter((order) => {
        const waitingMinutes = getWaitingMinutes(order.createdAt, currentTime);
        return isKitchenOrderWaiting(order)
          && waitingMinutes >= criticalWarningMinutes
          && !overdueAlertedOrderIds.current.has(order.id);
      });

      seenOrderIds.current = new Set(sortedOrders.map((order) => order.id));
      hasLoadedOrders.current = true;
      newlyOverdueOrders.forEach((order) => overdueAlertedOrderIds.current.add(order.id));
      setOrders(sortedOrders);
      setWaiterCalls(nextWaiterCalls);
      setClock(currentTime);
      setError(null);

      if (newOrders.length > 0) {
        const tables = newOrders.map((order) => `Masa ${order.tableNumber}`).join(", ");
        setNewOrderNotice(`${newOrders.length} yeni sipariş geldi · ${tables}`);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNewOrderNotice(null), 8_000);
        for (const order of newOrders) {
          void showKitchenAlertNotification(order, "new").catch(() => undefined);
        }
      }

      for (const order of newlyOverdueOrders) {
        void showKitchenAlertNotification(
          order,
          "overdue",
          getWaitingMinutes(order.createdAt, currentTime)
        ).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Siparişler yüklenemedi.");
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadOrders();
    const timer = setInterval(() => void loadOrders(false), 4_000);
    const clockTimer = setInterval(() => setClock(Date.now()), 30_000);
    const blinkTimer = setInterval(() => setBlinkOn((current) => !current), 650);
    return () => {
      clearInterval(timer);
      clearInterval(clockTimer);
      clearInterval(blinkTimer);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [loadOrders]);

  useEffect(() => {
    let connection: ReturnType<HubConnectionBuilder["build"]> | null = null;
    let disposed = false;
    const refreshFromEvent = () => void loadOrders(false);

    async function connectRealtime() {
      try {
        const nextConnection = new HubConnectionBuilder()
          .withUrl(`${apiBaseUrl.replace(/\/$/, "")}/hubs/orders`, {
            withCredentials: true,
            accessTokenFactory: async () => await getAccessToken() ?? ""
          })
          .withAutomaticReconnect([0, 2_000, 5_000, 10_000])
          .configureLogging(LogLevel.Warning)
          .build();

        connection = nextConnection;
        nextConnection.on("NewOrder", refreshFromEvent);
        nextConnection.on("OrderStatusChanged", refreshFromEvent);
        nextConnection.on("OrderItemStatusChanged", refreshFromEvent);
        nextConnection.on("TableStatusChanged", refreshFromEvent);
        nextConnection.on("PaymentStatusChanged", refreshFromEvent);
        nextConnection.on("WaiterCallCreated", refreshFromEvent);
        nextConnection.on("WaiterCallResolved", refreshFromEvent);
        await nextConnection.start();
        if (!disposed) refreshFromEvent();
      } catch {
        // SignalR native cihazda veya proxy arkasında kurulamazsa ekran açık
        // kalır; dört saniyelik otomatik yenileme siparişleri güncel tutar.
      }
    }

    void connectRealtime();

    return () => {
      disposed = true;
      connection?.off("NewOrder", refreshFromEvent);
      connection?.off("OrderStatusChanged", refreshFromEvent);
      connection?.off("OrderItemStatusChanged", refreshFromEvent);
      connection?.off("TableStatusChanged", refreshFromEvent);
      connection?.off("PaymentStatusChanged", refreshFromEvent);
      connection?.off("WaiterCallCreated", refreshFromEvent);
      connection?.off("WaiterCallResolved", refreshFromEvent);
      if (connection && connection.state !== HubConnectionState.Disconnected) void connection.stop();
    };
  }, [apiBaseUrl, loadOrders]);

  const pendingCount = useMemo(
    () => orders.flatMap((order) => order.items).filter((item) => item.status === "Pending").length,
    [orders]
  );
  const preparingCount = useMemo(
    () => orders.flatMap((order) => order.items).filter((item) => item.status === "Preparing").length,
    [orders]
  );
  const criticalOrderCount = useMemo(
    () => orders.filter(
      (order) => isKitchenOrderWaiting(order)
        && getWaitingMinutes(order.createdAt, clock) >= criticalWarningMinutes
    ).length,
    [clock, orders]
  );

  async function changeItemStatus(itemId: number, status: OrderItemStatus) {
    setUpdatingItemId(itemId);
    try {
      await updateItemStatus(apiBaseUrl, itemId, status);
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
      await createPayment(apiBaseUrl, orderId, method, paymentId);
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
      await splitPayment(apiBaseUrl, orderId, splitCount);
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
      await cancelOrder(apiBaseUrl, cancellingOrderId, cancellationReason.trim());
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
      await resolveWaiterCall(apiBaseUrl, id);
      await loadOrders(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Garson çağrısı kapatılamadı.");
    } finally {
      setResolvingWaiterCallId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.kicker}>Mutfak ekranı</Text>
            <Text style={styles.title}>Aktif siparişler</Text>
            <Text style={styles.subtitle}>{username} · Canlı mutfak akışı</Text>
          </View>
          <Pressable onPress={() => void onLogout()} style={styles.logoutButton}>
            <Text style={styles.logoutButtonText}>Çıkış yap</Text>
          </Pressable>
        </View>

        <View style={styles.toolbar}>
          <Text style={styles.toolbarText}>Değişiklikler anlık olarak güncellenir.</Text>
          <Pressable disabled={isLoading} onPress={() => void loadOrders()} style={styles.refreshButton}>
            <Text style={styles.refreshButtonText}>{isLoading ? "Yenileniyor…" : "Yenile"}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
                  style={[
                    styles.waiterCallResolveButton,
                    resolvingWaiterCallId === call.id ? styles.disabled : null
                  ]}
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
              <OrderItemRow
                key={item.id}
                item={item}
                isUpdating={updatingItemId === item.id}
                onUpdate={changeItemStatus}
              />
            ))}

            {order.status === "Ready" && order.tableStatus === "WaitingForPayment" && order.requestedPaymentMethod ? (
              <PaymentActions
                orderId={order.id}
                method={order.requestedPaymentMethod}
                payments={order.payments ?? []}
                isPaying={payingOrderId === order.id}
                isSplitting={splittingOrderId === order.id}
                onPayment={takePayment}
                onSplit={changePaymentSplit}
              />
            ) : null}

            <Pressable
              onPress={() => {
                setCancellingOrderId(order.id);
                setCancellationReason("");
              }}
              style={styles.cancelOrderButton}
            >
              <Text style={styles.cancelOrderButtonText}>Siparişi iptal et</Text>
            </Pressable>
          </View>
          );
        })}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={cancellingOrderId !== null}
        onRequestClose={() => setCancellingOrderId(null)}
      >
        <View style={styles.cancelModalBackdrop}>
          <View style={styles.cancelModal}>
            <Text style={styles.cancelModalTitle}>Sipariş iptal edilecek</Text>
            <Text style={styles.cancelModalHint}>Lütfen iptal sebebini girin.</Text>
            <TextInput
              autoFocus
              multiline
              value={cancellationReason}
              onChangeText={setCancellationReason}
              placeholder="İptal sebebi"
              style={styles.cancelReasonInput}
            />
            <View style={styles.cancelModalActions}>
              <Pressable
                onPress={() => {
                  setCancellingOrderId(null);
                  setCancellationReason("");
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Vazgeç</Text>
              </Pressable>
              <Pressable
                disabled={!cancellationReason.trim()}
                onPress={() => void confirmCancellation()}
                style={[styles.cancelConfirmButton, !cancellationReason.trim() ? styles.disabled : null]}
              >
                <Text style={styles.cancelConfirmButtonText}>İptal et</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function OrderItemRow({
  item,
  isUpdating,
  onUpdate
}: {
  item: OrderItemDto;
  isUpdating: boolean;
  onUpdate: (id: number, status: OrderItemStatus) => Promise<void>;
}) {
  const action = item.status === "Pending"
    ? { label: "Hazırlamaya al", status: "Preparing" as const }
    : item.status === "Preparing"
      ? { label: "Hazır", status: "Ready" as const }
      : null;

  return (
    <View style={styles.itemRow}>
      <View style={styles.flex}>
        <Text style={styles.itemName}>{item.quantity}× {item.menuItemName}</Text>
        {item.note ? <Text style={styles.note}>Not: {item.note}</Text> : null}
        <Text style={styles.itemStatus}>{itemStatusText(item.status)}</Text>
      </View>
      {action ? (
        <Pressable
          disabled={isUpdating}
          onPress={() => void onUpdate(item.id, action.status)}
          style={[styles.actionButton, isUpdating ? styles.disabled : null]}
        >
          <Text style={styles.actionButtonText}>{isUpdating ? "…" : action.label}</Text>
        </Pressable>
      ) : <Text style={styles.done}>Tamam</Text>}
    </View>
  );
}

function PaymentActions({
  orderId,
  method,
  payments,
  isPaying,
  isSplitting,
  onPayment,
  onSplit
}: {
  orderId: number;
  method: PaymentMethod;
  payments: PaymentDto[];
  isPaying: boolean;
  isSplitting: boolean;
  onPayment: (orderId: number, method: PaymentMethod, paymentId?: number) => Promise<void>;
  onSplit: (orderId: number, splitCount: number) => Promise<void>;
}) {
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
                <Text style={styles.splitButtonText}>
                  {payments.length === splitCount ? `✓ ${splitCount} parça` : `${splitCount} parçaya böl`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {(payments.length ? payments : [{ id: 0, amount: 0, status: "Pending", method } as PaymentDto]).map((payment, index) => (
        <Pressable
          key={payment.id || index}
          disabled={isPaying || isSplitting || payment.status === "Completed"}
          onPress={() => void onPayment(orderId, payment.method, payment.id || undefined)}
          style={[styles.paymentButton, (isPaying || isSplitting || payment.status === "Completed") ? styles.disabled : null]}
        >
          <Text style={styles.paymentButtonText}>
            {payment.status === "Completed"
              ? `${index + 1}. parça ödendi`
              : isPaying
                ? "İşleniyor…"
                : `${payments.length > 1 ? `${index + 1}. parça · ${payment.amount.toFixed(2)} TL` : "Müşteriden ödeme alındı"}`}
          </Text>
        </Pressable>
      ))}
    </View>
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saat bilgisi yok";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getWaitingMinutes(value: string, currentTime = Date.now()) {
  const createdAt = new Date(value).getTime();
  if (Number.isNaN(createdAt)) return 0;
  return Math.max(0, Math.floor((currentTime - createdAt) / 60_000));
}

function isKitchenOrderWaiting(order: OrderDto) {
  return order.status === "Pending" || order.status === "Preparing";
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#17212b" },
  container: { backgroundColor: "#17212b", gap: 16, minHeight: "100%", padding: 18, paddingBottom: 36 },
  headerRow: { alignItems: "center", flexDirection: "row", gap: 12, paddingTop: 8 },
  flex: { flex: 1 },
  kicker: { color: "#f7b733", fontSize: 13, fontWeight: "800", textTransform: "uppercase" },
  title: { color: "#fff", fontSize: 30, fontWeight: "900" },
  subtitle: { color: "#b8c6d1", fontSize: 14, marginTop: 4 },
  logoutButton: { alignItems: "center", backgroundColor: "#31475d", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  logoutButtonText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  toolbar: { alignItems: "center", backgroundColor: "#253b53", borderRadius: 10, flexDirection: "row", gap: 10, padding: 12 },
  toolbarText: { color: "#c5d0d9", flex: 1, fontSize: 12 },
  refreshButton: { backgroundColor: "#f7b733", borderRadius: 8, paddingHorizontal: 13, paddingVertical: 9 },
  refreshButtonText: { color: "#2f250d", fontSize: 12, fontWeight: "900" },
  error: { backgroundColor: "#fff0ef", borderRadius: 8, color: "#b42318", fontWeight: "700", padding: 11 },
  newOrderBanner: { alignItems: "center", backgroundColor: "#dcfce7", borderColor: "#22c55e", borderRadius: 10, borderWidth: 2, flexDirection: "row", gap: 11, padding: 13 },
  newOrderBannerIcon: { color: "#16a34a", fontSize: 24 },
  newOrderBannerTitle: { color: "#14532d", fontSize: 17, fontWeight: "900" },
  newOrderBannerText: { color: "#166534", fontSize: 13, fontWeight: "700", marginTop: 2 },
  criticalSummary: { backgroundColor: "#991b1b", borderRadius: 10, padding: 12 },
  criticalSummaryBlink: { backgroundColor: "#ef4444" },
  criticalSummaryText: { color: "#fff", fontSize: 14, fontWeight: "900", textAlign: "center" },
  waiterCallsPanel: { backgroundColor: "#fff4d8", borderColor: "#efc86c", borderRadius: 10, borderWidth: 1, gap: 8, padding: 12 },
  waiterCallsHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  waiterCallsTitle: { color: "#674600", fontSize: 18, fontWeight: "900" },
  waiterCallsCount: { alignItems: "center", backgroundColor: "#d97706", borderRadius: 14, height: 28, justifyContent: "center", minWidth: 28, paddingHorizontal: 7 },
  waiterCallsCountText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  waiterCallRow: { alignItems: "center", backgroundColor: "#fff", borderRadius: 8, flexDirection: "row", gap: 10, padding: 11 },
  waiterCallTable: { color: "#17212b", fontSize: 17, fontWeight: "900" },
  waiterCallTime: { color: "#75623a", fontSize: 12, marginTop: 2 },
  waiterCallResolveButton: { backgroundColor: "#178251", borderRadius: 8, minWidth: 104, paddingHorizontal: 11, paddingVertical: 10 },
  waiterCallResolveText: { color: "#fff", fontSize: 12, fontWeight: "900", textAlign: "center" },
  stats: { flexDirection: "row", gap: 8 },
  stat: { backgroundColor: "#253b53", borderRadius: 10, flex: 1, gap: 3, padding: 12 },
  statValue: { color: "#fff", fontSize: 24, fontWeight: "900" },
  statLabel: { color: "#b8c6d1", fontSize: 11, fontWeight: "700" },
  empty: { color: "#b8c6d1", paddingVertical: 30, textAlign: "center" },
  orderCard: { backgroundColor: "#fff", borderRadius: 10, gap: 8, padding: 14 },
  overdueOrderCard: { backgroundColor: "#fff8e7", borderColor: "#f59e0b", borderWidth: 2 },
  criticalOrderCard: { backgroundColor: "#fff1f2", borderColor: "#dc2626", borderWidth: 3 },
  criticalOrderCardBlink: { backgroundColor: "#fecaca", borderColor: "#ff0000" },
  orderHeader: { alignItems: "center", borderBottomColor: "#e7edf2", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 10 },
  tableTitle: { color: "#17212b", fontSize: 21, fontWeight: "900" },
  orderMeta: { color: "#667788", fontSize: 13, marginTop: 2 },
  waitingTime: { color: "#178251", fontSize: 12, fontWeight: "800", marginTop: 4 },
  waitingTimeOverdue: { color: "#b45309" },
  waitingTimeCritical: { color: "#b91c1c", fontSize: 13, fontWeight: "900" },
  statusPill: { backgroundColor: "#fff3cf", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  readyPill: { backgroundColor: "#d8f3e7" },
  statusText: { color: "#805900", fontSize: 12, fontWeight: "800" },
  itemRow: { alignItems: "center", borderBottomColor: "#edf1f4", borderBottomWidth: 1, flexDirection: "row", gap: 10, paddingVertical: 9 },
  itemName: { color: "#17212b", fontSize: 16, fontWeight: "800" },
  note: { color: "#9b5a00", fontSize: 13, marginTop: 2 },
  itemStatus: { color: "#667788", fontSize: 12, marginTop: 4 },
  actionButton: { backgroundColor: "#e36b36", borderRadius: 8, minWidth: 105, paddingHorizontal: 10, paddingVertical: 10 },
  actionButtonText: { color: "#fff", fontSize: 12, fontWeight: "900", textAlign: "center" },
  done: { color: "#178251", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  paymentPanel: { backgroundColor: "#eef8f2", borderRadius: 8, gap: 6, marginTop: 4, padding: 10 },
  paymentTitle: { color: "#17633f", fontSize: 14, fontWeight: "900" },
  paymentHint: { color: "#416451", fontSize: 12 },
  splitPanel: { gap: 6, marginTop: 4 },
  splitTitle: { color: "#284d3a", fontSize: 12, fontWeight: "800" },
  splitActions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  splitButton: { backgroundColor: "#dcebe3", borderRadius: 7, flexGrow: 1, minWidth: 90, paddingHorizontal: 8, paddingVertical: 9 },
  splitButtonSelected: { backgroundColor: "#9fd6b9" },
  splitButtonText: { color: "#175b3a", fontSize: 11, fontWeight: "900", textAlign: "center" },
  paymentButton: { backgroundColor: "#178251", borderRadius: 7, marginTop: 3, paddingVertical: 10 },
  paymentButtonText: { color: "#fff", fontSize: 12, fontWeight: "900", textAlign: "center" },
  cancelOrderButton: { backgroundColor: "#b83a31", borderRadius: 8, marginTop: 8, paddingVertical: 10 },
  cancelOrderButtonText: { color: "#fff", fontSize: 13, fontWeight: "900", textAlign: "center" },
  cancelModalBackdrop: { alignItems: "center", backgroundColor: "#0009", flex: 1, justifyContent: "center", padding: 18 },
  cancelModal: { backgroundColor: "#fff", borderRadius: 12, gap: 10, maxWidth: 430, padding: 18, width: "100%" },
  cancelModalTitle: { color: "#17212b", fontSize: 18, fontWeight: "900" },
  cancelModalHint: { color: "#667788", fontSize: 13 },
  cancelReasonInput: { borderColor: "#cbd5df", borderRadius: 8, borderWidth: 1, minHeight: 80, padding: 10, textAlignVertical: "top" },
  cancelModalActions: { flexDirection: "row", gap: 8 },
  secondaryButton: { backgroundColor: "#31475d", borderRadius: 8, flex: 1, paddingVertical: 10 },
  secondaryButtonText: { color: "#fff", fontWeight: "800", textAlign: "center" },
  cancelConfirmButton: { backgroundColor: "#b83a31", borderRadius: 8, flex: 1, paddingVertical: 10 },
  cancelConfirmButtonText: { color: "#fff", fontWeight: "800", textAlign: "center" }
});
