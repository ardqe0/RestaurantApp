import { QRCodeSVG } from "qrcode.react";
import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createCampaign,
  createCategory,
  createMenuItem,
  createTable,
  deleteCategory,
  deleteCampaign,
  deleteMenuItem,
  getAnalytics,
  getCurrentUser,
  getDashboardData,
  logout,
  updateCategory,
  updateCampaign,
  updateMenuItem,
  updateOrderStatus,
  updateTable
} from "./api";
import type {
  AnalyticsData,
  Campaign,
  Category,
  DashboardData,
  MenuItem,
  Order,
  OrderStatus,
  RestaurantTable,
  TableStatus
} from "./types";

const tableStatusText: Record<TableStatus, string> = {
  Empty: "Boş",
  Occupied: "Dolu",
  WaitingForPayment: "Hesap bekliyor"
};

const orderStatusText = {
  Pending: "Yeni",
  Preparing: "Hazırlanıyor",
  Ready: "Hazır",
  Delivered: "Tamamlandı",
  Cancelled: "İptal edildi"
} as const;

const paymentMethodText = {
  Cash: "Nakit",
  CreditCard: "Kart",
  QrPayment: "QR ödeme"
} as const;

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2
});

function dateInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function validateReportRange(startDate: string, endDate: string) {
  if (startDate > endDate) return "Başlangıç tarihi bitiş tarihinden sonra olamaz.";
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Geçerli bir tarih aralığı seçin.";
  const dayCount = Math.floor((end - start) / 86_400_000) + 1;
  return dayCount > 366 ? "Rapor aralığı en fazla 366 gün olabilir." : null;
}

function formatShortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

const today = new Date();
const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(today.getDate() - 6);

type CategoryDraft = Omit<Category, "id"> & { id: number | null };
type MenuItemDraft = Omit<MenuItem, "id"> & { id: number | null };
type TableDraft = Omit<RestaurantTable, "id"> & { id: number | null };
type CampaignDraft = Omit<Campaign, "id"> & { id: number | null };

const emptyCategoryDraft: CategoryDraft = { id: null, name: "", displayOrder: 1, isActive: true };
const emptyMenuItemDraft: MenuItemDraft = {
  id: null,
  categoryId: 0,
  name: "",
  description: "",
  price: 0,
  imageUrl: "",
  isAvailable: true,
  stockQuantity: 100,
  preparationMinutes: 15
};
const emptyTableDraft: TableDraft = {
  id: null,
  number: 1,
  qrCode: "",
  status: "Empty",
  capacity: 4
};
const campaignEnd = new Date(today);
campaignEnd.setDate(campaignEnd.getDate() + 7);
const dateTimeLocalValue = (value: Date) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const emptyCampaignDraft: CampaignDraft = {
  id: null,
  name: "",
  discountType: "Percentage",
  discountValue: 10,
  minimumOrderAmount: 0,
  startsAt: dateTimeLocalValue(today),
  endsAt: dateTimeLocalValue(campaignEnd),
  isActive: true
};

const restaurantId = "lezzet-duragi";
const restaurantName = "Lezzet Durağı";
const qrAddressStorageKey = "restaurant-admin-customer-qr-address";

function getInitialQrAddress() {
  if (typeof window === "undefined") return "http://localhost:5223";
  return window.localStorage.getItem(qrAddressStorageKey) ?? window.location.origin;
}

function buildTableQrUrl(baseAddress: string, tableCode: string) {
  const baseUrl = new URL(baseAddress.trim());
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error("QR müşteri adresi http:// veya https:// ile başlamalıdır.");
  }

  const customerUrl = new URL("/customer", baseUrl.origin);
  customerUrl.searchParams.set("restaurant", restaurantId);
  customerUrl.searchParams.set("table", tableCode);
  return customerUrl.toString();
}

function isLocalOnlyAddress(address: string) {
  try {
    const hostname = new URL(address).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1";
  } catch {
    return false;
  }
}

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [reportDate, setReportDate] = useState(dateInputValue(today));
  const [revenueStartDate, setRevenueStartDate] = useState(dateInputValue(sevenDaysAgo));
  const [revenueEndDate, setRevenueEndDate] = useState(dateInputValue(today));
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [dailyPdfPreparing, setDailyPdfPreparing] = useState(false);
  const [salesPdfPreparing, setSalesPdfPreparing] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "fallback">("connecting");
  const [summaryPeriod, setSummaryPeriod] = useState<"daily" | "weekly">("daily");
  const [orderTableFilter, setOrderTableFilter] = useState("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState<"all" | OrderStatus>("all");
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategoryDraft);
  const [menuItemDraft, setMenuItemDraft] = useState<MenuItemDraft>(emptyMenuItemDraft);
  const [tableDraft, setTableDraft] = useState<TableDraft>(emptyTableDraft);
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft>(emptyCampaignDraft);
  const [customerQrAddress, setCustomerQrAddress] = useState(getInitialQrAddress);
  const [qrTable, setQrTable] = useState<RestaurantTable | null>(null);
  const qrCardRef = useRef<HTMLDivElement>(null);
  const realtimeRefreshTimerRef = useRef<number | null>(null);

  const selectedTableQrUrl = useMemo(() => {
    if (!qrTable) return null;
    try {
      return buildTableQrUrl(customerQrAddress, qrTable.qrCode);
    } catch {
      return null;
    }
  }, [customerQrAddress, qrTable]);

  const filteredActiveOrders = useMemo(() => {
    if (!data) return [];
    return data.activeOrders.filter(order => {
      const tableMatches = orderTableFilter === "all" || String(order.tableNumber) === orderTableFilter;
      const statusMatches = orderStatusFilter === "all" || order.status === orderStatusFilter;
      return tableMatches && statusMatches;
    });
  }, [data, orderStatusFilter, orderTableFilter]);
  const lowStockItems = useMemo(
    () => [...(data?.menuItems ?? [])]
      .filter(item => item.stockQuantity <= 10)
      .sort((left, right) => left.stockQuantity - right.stockQuantity || left.name.localeCompare(right.name)),
    [data?.menuItems]
  );

  const handleError = useCallback((reason: unknown) => {
    if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) {
      window.location.replace("/");
      return;
    }
    setError(reason instanceof Error ? reason.message : "Beklenmeyen bir hata oluştu.");
  }, []);

  const loadDashboard = useCallback(async (background = false) => {
    if (!background) setRefreshing(true);
    try {
      const nextData = await getDashboardData(reportDate);
      setData(nextData);
      setError(null);
    } catch (reason) {
      handleError(reason);
    } finally {
      if (!background) setRefreshing(false);
    }
  }, [handleError, reportDate]);

  const loadAnalytics = useCallback(async (background = false) => {
    const rangeError = validateReportRange(revenueStartDate, revenueEndDate);
    if (rangeError) {
      if (!background) setError(rangeError);
      return;
    }
    try {
      setAnalytics(await getAnalytics(revenueStartDate, revenueEndDate));
      setError(null);
    } catch (reason) {
      handleError(reason);
    }
  }, [handleError, revenueEndDate, revenueStartDate]);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(user => {
        if (!active) return;
        if (user.role !== "Admin") {
          window.location.replace("/");
          return;
        }
        setAuthenticated(true);
      })
      .catch(handleError)
      .finally(() => active && setAuthChecking(false));
    return () => { active = false; };
  }, [handleError]);

  useEffect(() => {
    if (!authenticated) return;
    void loadDashboard();
    void loadAnalytics();
  }, [authenticated, loadAnalytics, loadDashboard]);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    const connection = new HubConnectionBuilder()
      .withUrl(`${window.location.origin}/hubs/orders`, { withCredentials: true })
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000])
      .configureLogging(LogLevel.Warning)
      .build();

    const refreshFromEvent = () => {
      if (realtimeRefreshTimerRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        void loadDashboard(true);
        void loadAnalytics(true);
      }, 150);
    };

    connection.on("NewOrder", refreshFromEvent);
    connection.on("OrderStatusChanged", refreshFromEvent);
    connection.on("OrderItemStatusChanged", refreshFromEvent);
    connection.on("TableStatusChanged", refreshFromEvent);
    connection.on("PaymentStatusChanged", refreshFromEvent);
    connection.on("MenuStockChanged", refreshFromEvent);
    connection.onreconnecting(() => active && setRealtimeStatus("fallback"));
    connection.onreconnected(() => {
      if (!active) return;
      setRealtimeStatus("connected");
      refreshFromEvent();
    });
    connection.onclose(() => active && setRealtimeStatus("fallback"));

    setRealtimeStatus("connecting");
    void connection.start()
      .then(() => active && setRealtimeStatus("connected"))
      .catch(() => active && setRealtimeStatus("fallback"));

    // SignalR kullanılamazsa panel en fazla 30 saniye geride kalır.
    const fallbackTimer = window.setInterval(() => {
      void loadDashboard(true);
      void loadAnalytics(true);
    }, 30_000);

    return () => {
      active = false;
      window.clearInterval(fallbackTimer);
      if (realtimeRefreshTimerRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      connection.off("NewOrder", refreshFromEvent);
      connection.off("OrderStatusChanged", refreshFromEvent);
      connection.off("OrderItemStatusChanged", refreshFromEvent);
      connection.off("TableStatusChanged", refreshFromEvent);
      connection.off("PaymentStatusChanged", refreshFromEvent);
      connection.off("MenuStockChanged", refreshFromEvent);
      if (connection.state !== HubConnectionState.Disconnected) {
        void connection.stop();
      }
    };
  }, [authenticated, loadAnalytics, loadDashboard]);

  useEffect(() => {
    if (!data?.categories.length || menuItemDraft.categoryId !== 0) return;
    setMenuItemDraft(current => ({ ...current, categoryId: data.categories[0].id }));
  }, [data?.categories, menuItemDraft.categoryId]);

  useEffect(() => {
    window.localStorage.setItem(qrAddressStorageKey, customerQrAddress);
  }, [customerQrAddress]);

  const refreshAll = async () => {
    await Promise.all([loadDashboard(), loadAnalytics()]);
  };

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setBusyAction(key);
    setError(null);
    try {
      await action();
      await loadDashboard(true);
    } catch (reason) {
      handleError(reason);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCategorySubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      name: categoryDraft.name.trim(),
      displayOrder: categoryDraft.displayOrder,
      isActive: categoryDraft.isActive
    };
    void runAction("category-save", async () => {
      if (categoryDraft.id === null) await createCategory(payload);
      else await updateCategory(categoryDraft.id, payload);
      setCategoryDraft(emptyCategoryDraft);
    });
  };

  const handleMenuItemSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      categoryId: menuItemDraft.categoryId,
      name: menuItemDraft.name.trim(),
      description: menuItemDraft.description.trim(),
      price: menuItemDraft.price,
      imageUrl: menuItemDraft.imageUrl?.trim() || null,
      isAvailable: menuItemDraft.isAvailable,
      stockQuantity: menuItemDraft.stockQuantity,
      preparationMinutes: menuItemDraft.preparationMinutes
    };
    void runAction("item-save", async () => {
      if (menuItemDraft.id === null) await createMenuItem(payload);
      else await updateMenuItem(menuItemDraft.id, payload);
      setMenuItemDraft({ ...emptyMenuItemDraft, categoryId: data?.categories[0]?.id ?? 0 });
    });
  };

  const handleCampaignSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      name: campaignDraft.name.trim(),
      discountType: campaignDraft.discountType,
      discountValue: campaignDraft.discountValue,
      minimumOrderAmount: campaignDraft.minimumOrderAmount,
      startsAt: new Date(campaignDraft.startsAt).toISOString(),
      endsAt: new Date(campaignDraft.endsAt).toISOString(),
      isActive: campaignDraft.isActive
    };
    void runAction("campaign-save", async () => {
      if (campaignDraft.id === null) await createCampaign(payload);
      else await updateCampaign(campaignDraft.id, payload);
      setCampaignDraft(emptyCampaignDraft);
    });
  };

  const handleTableSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      number: tableDraft.number,
      qrCode: tableDraft.qrCode.trim(),
      capacity: tableDraft.capacity,
      status: tableDraft.status
    };
    void runAction("table-save", async () => {
      if (tableDraft.id === null) {
        await createTable({ number: payload.number, qrCode: payload.qrCode, capacity: payload.capacity });
      } else {
        await updateTable(tableDraft.id, payload);
      }
      setTableDraft(emptyTableDraft);
    });
  };

  const changeOrderStatus = (order: Order, status: OrderStatus) => {
    let cancellationReason: string | undefined;
    if (status === "Cancelled") {
      const reason = window.prompt(`Masa ${order.tableNumber} siparişi neden iptal ediliyor?`);
      if (reason === null) return;
      cancellationReason = reason.trim();
      if (!cancellationReason) {
        setError("Sipariş iptal sebebi zorunludur.");
        return;
      }
    }

    void runAction(`order-status-${order.id}`, () => updateOrderStatus(order.id, status, cancellationReason));
  };

  const showTableQr = (table: RestaurantTable) => {
    try {
      buildTableQrUrl(customerQrAddress, table.qrCode);
      setQrTable(table);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "QR kodu oluşturulamadı.");
    }
  };

  const downloadTableQr = () => {
    const svg = qrCardRef.current?.querySelector("svg");
    if (!svg || !qrTable || !selectedTableQrUrl) {
      setError("QR kodu indirilemedi. Müşteri adresini kontrol edin.");
      return;
    }

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
    const blobUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `masa-${qrTable.number}-${qrTable.qrCode}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  };

  const downloadPdf = (
    frameId: string,
    source: string,
    setPreparing: (value: boolean) => void
  ) => {
    setPreparing(true);
    setError(null);

    document.getElementById(frameId)?.remove();
    const frame = document.createElement("iframe");
    frame.id = frameId;
    frame.hidden = true;
    frame.title = "PDF indirme";
    frame.src = source;
    frame.addEventListener("load", () => {
      try {
        const document = frame.contentDocument;
        if (!document || !document.contentType.includes("application/json")) return;
        const body = document.body?.textContent?.trim();
        if (!body) return;
        const problem = JSON.parse(body) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? "PDF oluşturulamadı.");
      } catch {
        // Başarılı dosya indirmelerinde iframe içeriğine erişilemez; bu normaldir.
      }
    });
    document.body.appendChild(frame);

    window.setTimeout(() => setPreparing(false), 3_000);
    window.setTimeout(() => frame.remove(), 60_000);
  };

  const downloadDailyPdf = () => {
    void downloadPdf(
      "daily-report-download-frame",
      `/api/admin/reports/daily.pdf?date=${encodeURIComponent(reportDate)}&_=${Date.now()}`,
      setDailyPdfPreparing
    );
  };

  const downloadSalesPdf = () => {
    const rangeError = validateReportRange(revenueStartDate, revenueEndDate);
    if (rangeError) {
      setError(rangeError);
      return;
    }

    void loadAnalytics();
    downloadPdf(
      "sales-report-download-frame",
      `/api/admin/reports/revenue.pdf?startDate=${encodeURIComponent(revenueStartDate)}&endDate=${encodeURIComponent(revenueEndDate)}&_=${Date.now()}`,
      setSalesPdfPreparing
    );
  };

  const signOut = async () => {
    try {
      await logout();
    } finally {
      window.location.replace("/");
    }
  };

  if (authChecking) return <Splash message="Oturum kontrol ediliyor" />;
  if (!authenticated) return null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="kicker">Restoran otomasyon</span>
          <h1>Yönetim Paneli</h1>
          <p>Operasyon, menü ve satış verileri tek ekranda.</p>
        </div>
        <div className="topbar-actions">
          <span className={`live-indicator ${refreshing ? "refreshing" : ""} realtime-${realtimeStatus}`}>
            <i /> {refreshing
              ? "Yenileniyor"
              : realtimeStatus === "connected"
                ? "Canlı bağlı"
                : realtimeStatus === "connecting"
                  ? "Bağlanıyor"
                  : "Yedek yenileme"}
          </span>
          <button className="button ghost" type="button" onClick={() => void refreshAll()}>Yenile</button>
          <button className="button secondary" type="button" onClick={() => void signOut()}>Çıkış yap</button>
        </div>
      </header>

      <main className="page">
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" aria-label="Hatayı kapat" onClick={() => setError(null)}>×</button>
          </div>
        )}

        {!data ? <DashboardSkeleton /> : (
          <>
            <section className="stat-grid" aria-label="Günlük özet">
              <StatCard label="Bugünkü ciro" value={money.format(data.summary.dailyRevenue)} tone="green" />
              <StatCard label="Bugünkü sipariş" value={String(data.summary.dailyOrderCount)} tone="amber" />
              <StatCard label="Aktif masa / toplam" value={`${data.summary.activeTableCount} / ${data.summary.totalTableCount}`} tone="blue" />
              <StatCard label="Aktif sipariş" value={String(data.summary.activeOrderCount)} tone="red" />
            </section>

            <Section title="Masa durumu" description="Canlı operasyon özeti">
              <div className="table-grid">
                {data.tables.map(table => (
                  <article className={`table-card status-${table.status}`} key={table.id}>
                    <div className="table-card-top"><span>Masa</span><strong>{table.number}</strong></div>
                    <p>{tableStatusText[table.status]}</p>
                    <small>{table.capacity} kişilik</small>
                  </article>
                ))}
              </div>
            </Section>

            <Section
              title="Aktif siparişler"
              description="Mutfak ve ödeme takibi"
              actions={(
                <div className="order-filters">
                  <label>
                    Masa
                    <select value={orderTableFilter} onChange={event => setOrderTableFilter(event.target.value)}>
                      <option value="all">Tüm masalar</option>
                      {[...new Set(data.activeOrders.map(order => order.tableNumber))]
                        .sort((left, right) => left - right)
                        .map(tableNumber => <option key={tableNumber} value={tableNumber}>Masa {tableNumber}</option>)}
                    </select>
                  </label>
                  <label>
                    Durum
                    <select
                      value={orderStatusFilter}
                      onChange={event => setOrderStatusFilter(event.target.value as "all" | OrderStatus)}
                    >
                      <option value="all">Tüm durumlar</option>
                      <option value="Pending">Yeni</option>
                      <option value="Preparing">Hazırlanıyor</option>
                      <option value="Ready">Hazır</option>
                    </select>
                  </label>
                </div>
              )}
            >
              {data.activeOrders.length === 0 ? <EmptyState>Aktif sipariş yok.</EmptyState> : (
                filteredActiveOrders.length === 0 ? <EmptyState>Bu filtrelere uyan sipariş yok.</EmptyState> : <div className="order-list">
                  {filteredActiveOrders.map(order => (
                    <article className="order-card" key={order.id}>
                      <div className="order-card-head">
                        <div><strong>Masa {order.tableNumber}</strong><span>Sipariş #{order.id}</span></div>
                        <span className={`status-badge order-${order.status}`}>{orderStatusText[order.status]}</span>
                      </div>
                      <div className="order-items">
                        {order.items.map(item => (
                          <span className={`order-item-line item-${item.status}`} key={item.id}>
                            {item.quantity}× {item.menuItemName} · {item.status === "Pending" ? "Bekliyor" : item.status === "Preparing" ? "Hazırlanıyor" : "Hazır"}
                            {item.note ? <small>Not: {item.note}</small> : null}
                          </span>
                        ))}
                      </div>
                      <div className="order-card-footer">
                        <div className="order-total">{money.format(order.totalAmount)}</div>
                        <div className="order-status-actions">
                          {order.status === "Pending" ? (
                            <button
                              className="icon-button edit"
                              disabled={busyAction === `order-status-${order.id}`}
                              onClick={() => changeOrderStatus(order, "Preparing")}
                              type="button"
                            >Hazırlamaya al</button>
                          ) : null}
                          {order.status === "Pending" || order.status === "Preparing" ? (
                            <button
                              className="icon-button ready"
                              disabled={busyAction === `order-status-${order.id}`}
                              onClick={() => changeOrderStatus(order, "Ready")}
                              type="button"
                            >Hazır yap</button>
                          ) : null}
                          <button
                            className="icon-button danger"
                            disabled={busyAction === `order-status-${order.id}`}
                            onClick={() => changeOrderStatus(order, "Cancelled")}
                            type="button"
                          >İptal et</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Satış analizi" description="Ciro ve ürün performansı">
              <form className="date-filter" onSubmit={event => { event.preventDefault(); downloadSalesPdf(); }}>
                <label>Başlangıç tarihi<input max={revenueEndDate} type="date" value={revenueStartDate} onChange={event => setRevenueStartDate(event.target.value)} required /></label>
                <label>Bitiş tarihi<input min={revenueStartDate} type="date" value={revenueEndDate} onChange={event => setRevenueEndDate(event.target.value)} required /></label>
                <button className="button primary" type="submit" disabled={salesPdfPreparing}>{salesPdfPreparing ? "PDF hazırlanıyor…" : "Raporu getir"}</button>
              </form>
              {!analytics ? <div className="panel-loading">Satış verileri yükleniyor…</div> : (
                <div className="analytics-content">
                  <div className="analytics-grid">
                    <div className="chart-panel">
                      <p className="panel-label">Seçili tarih aralığı cirosu</p>
                      <strong className="range-total">{money.format(analytics.revenue.totalRevenue)}</strong>
                      <RevenueChart data={analytics.revenue.dailyRevenue} />
                    </div>
                    <div className="product-performance">
                      <div className="top-products">
                        <div className="subsection-head"><h3>En çok satanlar</h3><span>İlk 5 ürün</span></div>
                        {analytics.topItems.length === 0 ? <EmptyState>Seçili dönemde tamamlanan ürün satışı yok.</EmptyState> : analytics.topItems.map((item, index) => (
                          <div className="rank-row" key={item.menuItemId}>
                            <span className="rank-number">{index + 1}</span>
                            <div><strong>{item.name}</strong><small>{money.format(item.revenue)}</small></div>
                            <b>{item.quantity} adet</b>
                          </div>
                        ))}
                      </div>
                      <div className="top-products bottom-products">
                        <div className="subsection-head"><h3>En az satanlar</h3><span>İlk 5 ürün</span></div>
                        {analytics.bottomItems.length === 0 ? <EmptyState>Raporlanabilecek menü ürünü yok.</EmptyState> : analytics.bottomItems.map((item, index) => (
                          <div className="rank-row" key={item.menuItemId}>
                            <span className="rank-number">{index + 1}</span>
                            <div><strong>{item.name}</strong><small>{money.format(item.revenue)}</small></div>
                            <b>{item.quantity} adet</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="summary-panel">
                    <div className="summary-head">
                      <div>
                        <h3>Satış özeti</h3>
                        <p>Sipariş, tamamlanma, iptal ve ciro değerleri</p>
                      </div>
                      <div className="summary-toggle">
                        <button className={summaryPeriod === "daily" ? "active" : ""} onClick={() => setSummaryPeriod("daily")} type="button">Günlük</button>
                        <button className={summaryPeriod === "weekly" ? "active" : ""} onClick={() => setSummaryPeriod("weekly")} type="button">Haftalık</button>
                      </div>
                    </div>
                    <div className="summary-table-wrap">
                      <table className="summary-table">
                        <thead><tr><th>Dönem</th><th>Sipariş</th><th>Tamamlanan</th><th>İptal</th><th>Ciro</th></tr></thead>
                        <tbody>
                          {(summaryPeriod === "daily" ? analytics.summaries.daily : analytics.summaries.weekly).map(row => (
                            <tr key={`${row.startDate}-${row.endDate}`}>
                              <td>{row.startDate === row.endDate ? formatShortDate(row.startDate) : `${formatShortDate(row.startDate)} – ${formatShortDate(row.endDate)}`}</td>
                              <td>{row.totalOrders}</td>
                              <td>{row.completedOrders}</td>
                              <td>{row.cancelledOrders}</td>
                              <td>{money.format(row.totalRevenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </Section>

            <Section title="Kampanya ve indirimler" description="Aktif tarih aralığında siparişe otomatik uygulanan indirimler">
              <form className="editor-form campaign-form" onSubmit={handleCampaignSubmit}>
                <label>Kampanya adı<input value={campaignDraft.name} onChange={event => setCampaignDraft({ ...campaignDraft, name: event.target.value })} required /></label>
                <label>İndirim türü<select value={campaignDraft.discountType} onChange={event => setCampaignDraft({ ...campaignDraft, discountType: event.target.value as Campaign["discountType"] })}><option value="Percentage">Yüzde</option><option value="FixedAmount">Sabit tutar</option></select></label>
                <label>İndirim değeri<input type="number" min="0.01" max={campaignDraft.discountType === "Percentage" ? 100 : undefined} step="0.01" value={campaignDraft.discountValue} onChange={event => setCampaignDraft({ ...campaignDraft, discountValue: Number(event.target.value) })} required /></label>
                <label>Minimum sepet<input type="number" min="0" step="0.01" value={campaignDraft.minimumOrderAmount} onChange={event => setCampaignDraft({ ...campaignDraft, minimumOrderAmount: Number(event.target.value) })} required /></label>
                <label>Başlangıç<input type="datetime-local" value={campaignDraft.startsAt.slice(0, 16)} onChange={event => setCampaignDraft({ ...campaignDraft, startsAt: event.target.value })} required /></label>
                <label>Bitiş<input type="datetime-local" value={campaignDraft.endsAt.slice(0, 16)} onChange={event => setCampaignDraft({ ...campaignDraft, endsAt: event.target.value })} required /></label>
                <label className="checkbox-label"><input type="checkbox" checked={campaignDraft.isActive} onChange={event => setCampaignDraft({ ...campaignDraft, isActive: event.target.checked })} /> Aktif</label>
                <div className="form-actions">
                  <button className="button primary" disabled={busyAction === "campaign-save"} type="submit">{campaignDraft.id === null ? "Kampanya ekle" : "Kampanyayı güncelle"}</button>
                  {campaignDraft.id !== null && <button className="button secondary" type="button" onClick={() => setCampaignDraft(emptyCampaignDraft)}>İptal</button>}
                </div>
              </form>
              <div className="entity-list campaign-list">
                {data.campaigns.length === 0 ? <EmptyState>Henüz kampanya oluşturulmadı.</EmptyState> : data.campaigns.map(campaign => (
                  <div className="entity-row" key={campaign.id}>
                    <div>
                      <strong>{campaign.name}</strong>
                      <small>
                        {campaign.discountType === "Percentage" ? `%${campaign.discountValue}` : money.format(campaign.discountValue)}
                        {" · "}{money.format(campaign.minimumOrderAmount)} üzeri
                        {" · "}{new Date(campaign.startsAt).toLocaleDateString("tr-TR")}–{new Date(campaign.endsAt).toLocaleDateString("tr-TR")}
                        {" · "}{campaign.isActive ? "Aktif" : "Pasif"}
                      </small>
                    </div>
                    <div className="row-actions">
                      <button className="icon-button edit" type="button" onClick={() => setCampaignDraft({
                        ...campaign,
                        startsAt: dateTimeLocalValue(new Date(campaign.startsAt)),
                        endsAt: dateTimeLocalValue(new Date(campaign.endsAt))
                      })}>Düzenle</button>
                      <button className="icon-button danger" type="button" onClick={() => {
                        if (window.confirm("Kampanya silinsin mi? Kullanılmış kampanyalar pasife alınır.")) void runAction(`campaign-delete-${campaign.id}`, () => deleteCampaign(campaign.id));
                      }}>Sil</button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Menü yönetimi" description="Kategori ve ürün işlemleri">
              {lowStockItems.length > 0 && (
                <div className="stock-alert-panel">
                  <div>
                    <strong>Düşük stok uyarısı</strong>
                    <small>{lowStockItems.length} ürünün stoğu 10 veya altında.</small>
                  </div>
                  <div className="stock-alert-items">
                    {lowStockItems.map(item => (
                      <span className={item.stockQuantity <= 5 ? "critical" : "low"} key={item.id}>
                        {item.name}: {item.stockQuantity}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="management-grid">
                <div className="management-column">
                  <div className="subsection-head"><h3>Kategoriler</h3><span>{data.categories.length} kayıt</span></div>
                  <form className="editor-form category-form" onSubmit={handleCategorySubmit}>
                    <label>Kategori adı<input value={categoryDraft.name} onChange={event => setCategoryDraft({ ...categoryDraft, name: event.target.value })} required /></label>
                    <label>Sıra<input type="number" min="0" value={categoryDraft.displayOrder} onChange={event => setCategoryDraft({ ...categoryDraft, displayOrder: Number(event.target.value) })} required /></label>
                    <label className="checkbox-label"><input type="checkbox" checked={categoryDraft.isActive} onChange={event => setCategoryDraft({ ...categoryDraft, isActive: event.target.checked })} /> Aktif</label>
                    <div className="form-actions">
                      <button className="button primary" disabled={busyAction === "category-save"} type="submit">{categoryDraft.id === null ? "Kategori ekle" : "Kategoriyi güncelle"}</button>
                      {categoryDraft.id !== null && <button className="button secondary" type="button" onClick={() => setCategoryDraft(emptyCategoryDraft)}>İptal</button>}
                    </div>
                  </form>
                  <div className="entity-list">
                    {data.categories.map(category => (
                      <div className="entity-row" key={category.id}>
                        <div><strong>{category.name}</strong><small>Sıra {category.displayOrder} · {category.isActive ? "Aktif" : "Pasif"}</small></div>
                        <div className="row-actions">
                          <button className="icon-button edit" type="button" onClick={() => setCategoryDraft({ ...category })}>Düzenle</button>
                          <button className="icon-button danger" type="button" onClick={() => {
                            if (window.confirm("Kategori silinsin mi?")) void runAction(`category-delete-${category.id}`, () => deleteCategory(category.id));
                          }}>Sil</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="management-column wide">
                  <div className="subsection-head"><h3>Menü ürünleri</h3><span>{data.menuItems.length} kayıt</span></div>
                  <form className="editor-form item-form" onSubmit={handleMenuItemSubmit}>
                    <label>Kategori<select value={menuItemDraft.categoryId} onChange={event => setMenuItemDraft({ ...menuItemDraft, categoryId: Number(event.target.value) })} required>{data.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                    <label>Ürün adı<input value={menuItemDraft.name} onChange={event => setMenuItemDraft({ ...menuItemDraft, name: event.target.value })} required /></label>
                    <label>Fiyat<input type="number" min="0" step="0.01" value={menuItemDraft.price} onChange={event => setMenuItemDraft({ ...menuItemDraft, price: Number(event.target.value) })} required /></label>
                    <label>Hazırlık süresi<input type="number" min="0" value={menuItemDraft.preparationMinutes} onChange={event => setMenuItemDraft({ ...menuItemDraft, preparationMinutes: Number(event.target.value) })} required /></label>
                    <label>Stok adedi<input type="number" min="0" step="1" value={menuItemDraft.stockQuantity} onChange={event => setMenuItemDraft({ ...menuItemDraft, stockQuantity: Number(event.target.value) })} required /></label>
                    <label className="full-field">Açıklama<textarea value={menuItemDraft.description} onChange={event => setMenuItemDraft({ ...menuItemDraft, description: event.target.value })} /></label>
                    <label className="full-field">Görsel yolu<input value={menuItemDraft.imageUrl ?? ""} onChange={event => setMenuItemDraft({ ...menuItemDraft, imageUrl: event.target.value })} placeholder="/images/menu/hamburger.jpg" /></label>
                    <label className="checkbox-label full-field"><input type="checkbox" checked={menuItemDraft.isAvailable} onChange={event => setMenuItemDraft({ ...menuItemDraft, isAvailable: event.target.checked })} /> Satışta</label>
                    {menuItemDraft.imageUrl && <div className="image-preview full-field"><img src={menuItemDraft.imageUrl} alt="Ürün önizlemesi" /><span>Görsel önizlemesi</span></div>}
                    <div className="form-actions full-field">
                      <button className="button primary" disabled={busyAction === "item-save" || data.categories.length === 0} type="submit">{menuItemDraft.id === null ? "Ürün ekle" : "Ürünü güncelle"}</button>
                      {menuItemDraft.id !== null && <button className="button secondary" type="button" onClick={() => setMenuItemDraft({ ...emptyMenuItemDraft, categoryId: data.categories[0]?.id ?? 0 })}>İptal</button>}
                    </div>
                  </form>
                  <div className="entity-list product-list">
                    {data.menuItems.map(item => (
                      <div className="entity-row" key={item.id}>
                        {item.imageUrl ? <img className="product-thumb" src={item.imageUrl} alt="" /> : <span className="product-placeholder">🍽</span>}
                        <div className="entity-main"><strong>{item.name}</strong><small>{data.categories.find(category => category.id === item.categoryId)?.name ?? "Kategorisiz"} · {money.format(item.price)} · Stok {item.stockQuantity} · {item.isAvailable ? "Satışta" : "Pasif"}</small></div>
                        <div className="row-actions">
                          <button className="icon-button edit" type="button" onClick={() => setMenuItemDraft({ ...item })}>Düzenle</button>
                          <button className="icon-button danger" type="button" onClick={() => {
                            if (window.confirm("Ürün silinsin mi?")) void runAction(`item-delete-${item.id}`, () => deleteMenuItem(item.id));
                          }}>Sil</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Masa yönetimi" description="Masa ekle, düzenle ve QR kodlarını hazırla">
              <div className="qr-address-panel">
                <label>
                  QR müşteri adresi
                  <input
                    type="url"
                    value={customerQrAddress}
                    onChange={event => setCustomerQrAddress(event.target.value)}
                    placeholder="http://192.168.1.100:5223"
                  />
                </label>
                <div className={`qr-address-note ${isLocalOnlyAddress(customerQrAddress) ? "warning" : ""}`}>
                  {isLocalOnlyAddress(customerQrAddress)
                    ? "localhost / 0.0.0.0 telefondan açılmaz. Bilgisayarın aynı ağdaki IP adresini yazın."
                    : "Bu adres QR koduna yazılır; telefonun bu adrese erişebilmesi gerekir."}
                </div>
              </div>
              <form className="editor-form table-form" onSubmit={handleTableSubmit}>
                <label>Masa no<input type="number" min="1" value={tableDraft.number} onChange={event => setTableDraft({ ...tableDraft, number: Number(event.target.value) })} required /></label>
                <label>QR kodu<input value={tableDraft.qrCode} onChange={event => setTableDraft({ ...tableDraft, qrCode: event.target.value })} required /></label>
                <label>Kapasite<input type="number" min="1" value={tableDraft.capacity} onChange={event => setTableDraft({ ...tableDraft, capacity: Number(event.target.value) })} required /></label>
                <label>Durum<select value={tableDraft.status} onChange={event => setTableDraft({ ...tableDraft, status: event.target.value as TableStatus })} disabled={tableDraft.id === null}><option value="Empty">Boş</option><option value="Occupied">Dolu</option><option value="WaitingForPayment">Hesap bekliyor</option></select></label>
                <div className="form-actions">
                  <button className="button primary" disabled={busyAction === "table-save"} type="submit">{tableDraft.id === null ? "Masa ekle" : "Masayı güncelle"}</button>
                  {tableDraft.id !== null && <button className="button secondary" type="button" onClick={() => setTableDraft(emptyTableDraft)}>İptal</button>}
                </div>
              </form>
              <div className="entity-list table-management-list">
                {data.tables.map(table => (
                  <div className="entity-row" key={table.id}>
                    <div><strong>Masa {table.number}</strong><small>{table.capacity} kişilik · {table.qrCode} · {tableStatusText[table.status]}</small></div>
                    <div className="row-actions">
                      <button className="icon-button qr" type="button" onClick={() => showTableQr(table)}>QR göster</button>
                      <button className="icon-button edit" type="button" onClick={() => setTableDraft({ ...table })}>Düzenle</button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title="Günlük rapor"
              description="Tarih bazlı sipariş ve ödeme özeti"
              actions={<div className="section-actions"><input aria-label="Rapor tarihi" type="date" value={reportDate} onChange={event => setReportDate(event.target.value)} /><button className="button secondary" type="button" onClick={downloadDailyPdf} disabled={dailyPdfPreparing}>{dailyPdfPreparing ? "PDF hazırlanıyor…" : "PDF indir"}</button></div>}
            >
              <div className="report-grid">
                <StatCard label="Ciro" value={money.format(data.dailyReport.totalRevenue)} tone="green" compact />
                <StatCard label={`Tamamlanan ${data.dailyReport.completedOrders} · İptal ${data.dailyReport.cancelledOrders}`} value={String(data.dailyReport.totalOrders)} tone="blue" compact />
                <StatCard label={`${data.dailyReport.mostSoldItemQuantity} adet`} value={data.dailyReport.mostSoldItemName ?? "Satış yok"} tone="amber" compact />
              </div>
              <div className="payment-list">
                {data.dailyReport.paymentMethods.length === 0 ? <EmptyState>Bu tarihte tamamlanan ödeme yok.</EmptyState> : data.dailyReport.paymentMethods.map(payment => (
                  <div key={payment.method}><span>{paymentMethodText[payment.method]}</span><strong>{money.format(payment.total)}</strong></div>
                ))}
              </div>
            </Section>

            <Section title="Sipariş geçmişi" description="Tamamlanan ve iptal edilen son 100 sipariş">
              {data.history.length === 0 ? <EmptyState>Bu tarihte geçmiş sipariş yok.</EmptyState> : (
                <div className="history-list">
                  {data.history.map(order => (
                    <div className="history-row" key={order.id}>
                      <div><strong>Masa {order.tableNumber} · Sipariş #{order.id}</strong><small>{new Date(order.createdAt).toLocaleString("tr-TR")} · {order.status === "Delivered" ? "Tamamlandı" : `İptal: ${order.cancellationReason ?? "Sebep belirtilmedi"}`}</small></div>
                      <b>{money.format(order.totalAmount)}</b>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="İşlem geçmişi" description="Yönetici ve mutfak kullanıcılarının son 100 kritik işlemi">
              {data.auditLogs.length === 0 ? <EmptyState>Henüz kayıtlı işlem yok.</EmptyState> : (
                <div className="audit-list">
                  {data.auditLogs.map(log => (
                    <details className="audit-row" key={log.id}>
                      <summary>
                        <span>
                          <strong>{log.userName} · {log.action}</strong>
                          <small>{log.entityType}{log.entityId ? ` #${log.entityId}` : ""} · {new Date(log.createdAt).toLocaleString("tr-TR")}</small>
                        </span>
                        <b>{log.role}</b>
                      </summary>
                      <div className="audit-details">
                        {log.beforeJson ? <div><span>Önce</span><code>{log.beforeJson}</code></div> : null}
                        {log.afterJson ? <div><span>Sonra</span><code>{log.afterJson}</code></div> : null}
                        <small>IP: {log.ipAddress ?? "Bilinmiyor"}</small>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </main>

      {qrTable ? (
        <div
          className="qr-modal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setQrTable(null);
          }}
          role="presentation"
        >
          <div aria-labelledby="table-qr-title" aria-modal="true" className="qr-modal" role="dialog">
            <div className="qr-modal-head">
              <div>
                <span className="kicker">Masa QR kodu</span>
                <h2 id="table-qr-title">Masa {qrTable.number}</h2>
              </div>
              <button aria-label="QR penceresini kapat" className="qr-close" onClick={() => setQrTable(null)} type="button">×</button>
            </div>

            {selectedTableQrUrl ? (
              <div className="qr-print-card" ref={qrCardRef}>
                <span className="qr-restaurant-name">{restaurantName}</span>
                <strong>Masa {qrTable.number}</strong>
                <p>Sipariş vermek için QR kodunu okutun.</p>
                <div className="qr-code-frame">
                  <QRCodeSVG level="M" marginSize={4} size={240} value={selectedTableQrUrl} />
                </div>
                <small>{qrTable.qrCode}</small>
                <code>{selectedTableQrUrl}</code>
              </div>
            ) : (
              <div className="qr-invalid-address">Geçerli bir QR müşteri adresi girin.</div>
            )}

            <div className="qr-modal-actions">
              <button className="button primary" disabled={!selectedTableQrUrl} onClick={downloadTableQr} type="button">SVG indir</button>
              <button className="button secondary" disabled={!selectedTableQrUrl} onClick={() => window.print()} type="button">Yazdır</button>
              <button className="button ghost" onClick={() => setQrTable(null)} type="button">Kapat</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="section-card">
      <div className="section-head">
        <div><h2>{title}</h2><p>{description}</p></div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, tone, compact = false }: { label: string; value: string; tone: "green" | "amber" | "blue" | "red"; compact?: boolean }) {
  return <article className={`stat-card tone-${tone} ${compact ? "compact" : ""}`}><i /><strong>{value}</strong><span>{label}</span></article>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

function Splash({ message }: { message: string }) {
  return <div className="splash"><div className="spinner" /><strong>{message}</strong></div>;
}

function DashboardSkeleton() {
  return <div className="skeleton-wrap"><div className="skeleton stats-skeleton" /><div className="skeleton section-skeleton" /><div className="skeleton section-skeleton" /></div>;
}

function RevenueChart({ data }: { data: AnalyticsData["revenue"]["dailyRevenue"] }) {
  const maxRevenue = useMemo(() => Math.max(1, ...data.map(day => Number(day.revenue))), [data]);
  if (data.length === 0) return <EmptyState>Bu tarih aralığında ciro verisi yok.</EmptyState>;

  return (
    <div className="chart-scroll">
      <div className="revenue-chart" style={{ minWidth: Math.max(520, data.length * 68) }}>
        {data.map(day => {
          const revenue = Number(day.revenue);
          const height = revenue === 0 ? 2 : Math.max(5, revenue / maxRevenue * 100);
          const date = new Date(`${day.date}T00:00:00`);
          return (
            <div className="chart-column" key={day.date} title={`${date.toLocaleDateString("tr-TR")}: ${money.format(revenue)}`}>
              <div className="bar-space">
                <div className="bar-fill" style={{ height: `${height}%` }}>
                  {revenue > 0 ? <span className="bar-value">{money.format(revenue).replace("₺", "").trim()}</span> : null}
                </div>
              </div>
              <small>{date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
