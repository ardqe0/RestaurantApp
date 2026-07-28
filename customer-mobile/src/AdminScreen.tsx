import { StatusBar } from "expo-status-bar";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import {
  createCategory,
  createCampaign,
  createMenuItem,
  deleteCategory,
  deleteCampaign,
  deleteMenuItem,
  getAdminAnalytics,
  getAdminDashboard,
  updateCategory,
  updateCampaign,
  updateMenuItem
} from "./adminApi";
import type {
  AdminAnalyticsDto,
  AdminCategoryDto,
  AdminDashboardDto,
  CampaignDto,
  MenuItemDto,
  OrderDto,
  OrderStatus,
  PaymentMethod,
  TableStatus
} from "./types";

type AdminTab = "overview" | "orders" | "tables" | "menu" | "campaigns" | "reports";

type AdminScreenProps = {
  apiBaseUrl: string;
  username: string;
  onLogout: () => void | Promise<void>;
};

const tabs: { key: AdminTab; label: string }[] = [
  { key: "overview", label: "Genel" },
  { key: "orders", label: "Siparişler" },
  { key: "tables", label: "Masalar" },
  { key: "menu", label: "Menü" },
  { key: "campaigns", label: "Kampanya" },
  { key: "reports", label: "Raporlar" }
];

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2
});

export function AdminScreen({ apiBaseUrl, username, onLogout }: AdminScreenProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [data, setData] = useState<AdminDashboardDto | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalyticsDto | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(7);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [nextData, nextAnalytics] = await Promise.all([
        getAdminDashboard(apiBaseUrl),
        getAdminAnalytics(apiBaseUrl, analyticsDays)
      ]);
      setData(nextData);
      setAnalytics(nextAnalytics);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Patron paneli verileri yüklenemedi.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [analyticsDays, apiBaseUrl]);

  useEffect(() => {
    void loadAll(true);
    const timer = setInterval(() => void loadAll(false), 15_000);
    return () => clearInterval(timer);
  }, [loadAll]);

  const occupiedTables = useMemo(
    () => data?.tables.filter((table) => table.status !== "Empty").length ?? 0,
    [data]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.kicker}>PATRON PANELİ</Text>
          <Text style={styles.headerTitle}>İşletme özeti</Text>
          <Text style={styles.headerSubtitle}>{username} · Veriler otomatik yenilenir</Text>
        </View>
        <Pressable onPress={() => void onLogout()} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Çıkış yap</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadAll(false)} tintColor="#168569" />}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void loadAll(true)}>
              <Text style={styles.retryText}>Tekrar dene</Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading && !data ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#168569" size="large" />
            <Text style={styles.loadingText}>Patron paneli hazırlanıyor…</Text>
          </View>
        ) : null}

        {data && activeTab === "overview" ? (
          <OverviewTab data={data} occupiedTables={occupiedTables} analytics={analytics} />
        ) : null}
        {data && activeTab === "orders" ? <OrdersTab orders={data.activeOrders} /> : null}
        {data && activeTab === "tables" ? <TablesTab data={data} /> : null}
        {data && activeTab === "menu" ? (
          <MenuTab data={data} apiBaseUrl={apiBaseUrl} onChanged={() => loadAll(false)} />
        ) : null}
        {data && activeTab === "campaigns" ? (
          <CampaignsTab data={data} apiBaseUrl={apiBaseUrl} onChanged={() => loadAll(false)} />
        ) : null}
        {data && activeTab === "reports" ? (
          <ReportsTab
            analytics={analytics}
            data={data}
            days={analyticsDays}
            onDaysChange={setAnalyticsDays}
          />
        ) : null}
      </ScrollView>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key ? styles.activeTab : null]}
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              numberOfLines={1}
              style={[styles.tabText, activeTab === tab.key ? styles.activeTabText : null]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function OverviewTab({
  data,
  analytics,
  occupiedTables
}: {
  data: AdminDashboardDto;
  analytics: AdminAnalyticsDto | null;
  occupiedTables: number;
}) {
  return (
    <>
      <Text style={styles.sectionEyebrow}>BUGÜN</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Ciro" value={money.format(data.summary.dailyRevenue)} tone="green" />
        <StatCard label="Sipariş" value={String(data.summary.dailyOrderCount)} tone="amber" />
        <StatCard label="Dolu masa" value={`${occupiedTables} / ${data.summary.totalTableCount}`} tone="blue" />
        <StatCard label="Aktif sipariş" value={String(data.summary.activeOrderCount)} tone="red" />
      </View>

      <Panel title="Günün satış özeti" subtitle="Tamamlanan ve iptal edilen siparişler">
        <View style={styles.summaryRows}>
          <InfoRow label="Toplam sipariş" value={String(data.dailyReport.totalOrders)} />
          <InfoRow label="Tamamlanan" value={String(data.dailyReport.completedOrders)} />
          <InfoRow label="İptal edilen" value={String(data.dailyReport.cancelledOrders)} />
          <InfoRow
            label="En çok satan"
            value={data.dailyReport.mostSoldItemName
              ? `${data.dailyReport.mostSoldItemName} (${data.dailyReport.mostSoldItemQuantity})`
              : "Satış yok"}
          />
        </View>
      </Panel>

      <Panel title="Son 7 gün" subtitle="Ciro hareketi ve öne çıkan ürün">
        {analytics ? (
          <>
            <Text style={styles.bigMoney}>{money.format(analytics.revenue.totalRevenue)}</Text>
            <RevenueChart analytics={analytics} />
            <InfoRow
              label="En çok satan ürün"
              value={analytics.topItems[0]
                ? `${analytics.topItems[0].name} · ${analytics.topItems[0].quantity} adet`
                : "Satış yok"}
            />
          </>
        ) : <ActivityIndicator color="#168569" />}
      </Panel>

      <Panel title="Aktif masalar" subtitle="Şu anda hizmet verilen masalar">
        {data.tables.filter((table) => table.status !== "Empty").length === 0 ? (
          <EmptyState text="Şu anda dolu masa yok." />
        ) : data.tables
          .filter((table) => table.status !== "Empty")
          .map((table) => (
            <InfoRow
              key={table.id}
              label={`Masa ${table.number}`}
              value={tableStatusText(table.status)}
            />
          ))}
      </Panel>
    </>
  );
}

function OrdersTab({ orders }: { orders: OrderDto[] }) {
  if (orders.length === 0) return <EmptyState text="Aktif sipariş bulunmuyor." />;

  return (
    <>
      <Text style={styles.pageTitle}>Aktif siparişler</Text>
      <Text style={styles.pageSubtitle}>Mutfaktaki tüm açık siparişlerin anlık görünümü</Text>
      {orders.map((order) => (
        <View key={order.id} style={styles.orderCard}>
          <View style={styles.orderHeader}>
            <View style={styles.flex}>
              <Text style={styles.orderTitle}>Masa {order.tableNumber}</Text>
              <Text style={styles.muted}>Sipariş #{order.id} · {formatDateTime(order.createdAt)}</Text>
            </View>
            <View style={[styles.statusBadge, orderStatusStyle(order.status)]}>
              <Text style={styles.statusBadgeText}>{orderStatusText(order.status)}</Text>
            </View>
          </View>
          {order.items.map((item) => (
            <View key={item.id} style={styles.orderItem}>
              <View style={styles.flex}>
                <Text style={styles.orderItemName}>{item.quantity}× {item.menuItemName}</Text>
                {item.note ? <Text style={styles.orderNote}>Not: {item.note}</Text> : null}
              </View>
              <Text style={styles.orderItemPrice}>{money.format(item.unitPrice * item.quantity)}</Text>
            </View>
          ))}
          <View style={styles.orderTotal}>
            <Text style={styles.orderTotalLabel}>Toplam</Text>
            <Text style={styles.orderTotalValue}>{money.format(order.totalAmount)}</Text>
          </View>
          {order.requestedPaymentMethod ? (
            <Text style={styles.paymentRequest}>
              Hesap istendi · {paymentMethodText(order.requestedPaymentMethod)}
            </Text>
          ) : null}
        </View>
      ))}
    </>
  );
}

function TablesTab({ data }: { data: AdminDashboardDto }) {
  return (
    <>
      <Text style={styles.pageTitle}>Masa durumu</Text>
      <Text style={styles.pageSubtitle}>Restorandaki masaların doluluk bilgisi</Text>
      <View style={styles.tableGrid}>
        {[...data.tables].sort((left, right) => left.number - right.number).map((table) => {
          const activeOrder = data.activeOrders.find((order) => order.tableId === table.id);
          return (
            <View key={table.id} style={[styles.tableCard, tableStyle(table.status)]}>
              <View style={styles.tableNumberCircle}>
                <Text style={styles.tableNumber}>{table.number}</Text>
              </View>
              <Text style={styles.tableStatus}>{tableStatusText(table.status)}</Text>
              <Text style={styles.tableMeta}>{table.capacity} kişilik</Text>
              {activeOrder ? (
                <Text style={styles.tableOrder}>Sipariş #{activeOrder.id} · {money.format(activeOrder.totalAmount)}</Text>
              ) : <Text style={styles.tableOrder}>Aktif sipariş yok</Text>}
            </View>
          );
        })}
      </View>
    </>
  );
}

type CampaignDraft = {
  id?: number;
  name: string;
  discountType: CampaignDto["discountType"];
  discountValue: string;
  minimumOrderAmount: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

function CampaignsTab({
  data,
  apiBaseUrl,
  onChanged
}: {
  data: AdminDashboardDto;
  apiBaseUrl: string;
  onChanged: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function openNew() {
    const startsAt = new Date();
    const endsAt = new Date(startsAt);
    endsAt.setDate(endsAt.getDate() + 7);
    setDraft({
      name: "",
      discountType: "Percentage",
      discountValue: "10",
      minimumOrderAmount: "0",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      isActive: true
    });
  }

  function openCampaign(campaign: CampaignDto) {
    setDraft({
      id: campaign.id,
      name: campaign.name,
      discountType: campaign.discountType,
      discountValue: String(campaign.discountValue).replace(".", ","),
      minimumOrderAmount: String(campaign.minimumOrderAmount).replace(".", ","),
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      isActive: campaign.isActive
    });
  }

  async function save() {
    if (!draft?.name.trim()) return Alert.alert("Eksik bilgi", "Kampanya adı zorunludur.");
    const discountValue = Number(draft.discountValue.replace(",", "."));
    const minimumOrderAmount = Number(draft.minimumOrderAmount.replace(",", "."));
    if (!Number.isFinite(discountValue) || discountValue <= 0 || !Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) {
      return Alert.alert("Geçersiz bilgi", "İndirim ve minimum sepet tutarını kontrol edin.");
    }
    if (draft.discountType === "Percentage" && discountValue > 100) {
      return Alert.alert("Geçersiz indirim", "Yüzde indirimi 100'den büyük olamaz.");
    }

    setIsSaving(true);
    try {
      const input = {
        name: draft.name.trim(),
        discountType: draft.discountType,
        discountValue,
        minimumOrderAmount,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        isActive: draft.isActive
      };
      if (draft.id) await updateCampaign(apiBaseUrl, draft.id, input);
      else await createCampaign(apiBaseUrl, input);
      setDraft(null);
      await onChanged();
    } catch (reason) {
      Alert.alert("Kampanya kaydedilemedi", reason instanceof Error ? reason.message : "İstek başarısız oldu.");
    } finally {
      setIsSaving(false);
    }
  }

  function remove(campaign: CampaignDto) {
    Alert.alert("Kampanyayı kaldır", `"${campaign.name}" kampanyası kaldırılsın mı?`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Kaldır",
        style: "destructive",
        onPress: () => void (async () => {
          try {
            await deleteCampaign(apiBaseUrl, campaign.id);
            await onChanged();
          } catch (reason) {
            Alert.alert("Kampanya kaldırılamadı", reason instanceof Error ? reason.message : "İstek başarısız oldu.");
          }
        })()
      }
    ]);
  }

  return (
    <>
      <Text style={styles.pageTitle}>Kampanya ve indirimler</Text>
      <Text style={styles.pageSubtitle}>Yeni kampanyalar varsayılan olarak 7 gün geçerlidir.</Text>
      <Pressable onPress={openNew} style={styles.menuToolbarButton}>
        <Text style={styles.menuToolbarButtonText}>+ Kampanya oluştur</Text>
      </Pressable>

      {draft ? (
        <View style={styles.editorCard}>
          <Text style={styles.editorTitle}>{draft.id ? "Kampanyayı düzenle" : "Kampanya oluştur"}</Text>
          <Text style={styles.editorLabel}>Kampanya adı</Text>
          <TextInput value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} style={styles.editorInput} />
          <Text style={styles.editorLabel}>İndirim türü</Text>
          <View style={styles.menuToolbar}>
            {(["Percentage", "FixedAmount"] as const).map((type) => (
              <Pressable key={type} onPress={() => setDraft({ ...draft, discountType: type })} style={[styles.menuToolbarButton, draft.discountType === type ? styles.activeTab : null]}>
                <Text style={[styles.menuToolbarButtonText, draft.discountType === type ? styles.activeTabText : null]}>{type === "Percentage" ? "Yüzde" : "Sabit tutar"}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.editorLabel}>İndirim değeri</Text>
          <TextInput keyboardType="decimal-pad" value={draft.discountValue} onChangeText={(discountValue) => setDraft({ ...draft, discountValue })} style={styles.editorInput} />
          <Text style={styles.editorLabel}>Minimum sepet tutarı</Text>
          <TextInput keyboardType="decimal-pad" value={draft.minimumOrderAmount} onChangeText={(minimumOrderAmount) => setDraft({ ...draft, minimumOrderAmount })} style={styles.editorInput} />
          <View style={styles.switchRow}><Text style={styles.editorLabel}>Aktif</Text><Switch value={draft.isActive} onValueChange={(isActive) => setDraft({ ...draft, isActive })} /></View>
          <View style={styles.editorActions}>
            <Pressable onPress={() => setDraft(null)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Vazgeç</Text></Pressable>
            <Pressable disabled={isSaving} onPress={() => void save()} style={styles.saveButton}><Text style={styles.saveButtonText}>{isSaving ? "Kaydediliyor…" : "Kaydet"}</Text></Pressable>
          </View>
        </View>
      ) : null}

      {data.campaigns.map((campaign) => (
        <View key={campaign.id} style={styles.editorCard}>
          <Text style={styles.editorTitle}>{campaign.name}</Text>
          <Text style={styles.pageSubtitle}>
            {campaign.discountType === "Percentage" ? `%${campaign.discountValue}` : money.format(campaign.discountValue)}
            {" · "}{money.format(campaign.minimumOrderAmount)} üzeri · {campaign.isActive ? "Aktif" : "Pasif"}
          </Text>
          <Text style={styles.pageSubtitle}>{new Date(campaign.startsAt).toLocaleDateString("tr-TR")} – {new Date(campaign.endsAt).toLocaleDateString("tr-TR")}</Text>
          <View style={styles.editorActions}>
            <Pressable onPress={() => remove(campaign)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Kaldır</Text></Pressable>
            <Pressable onPress={() => openCampaign(campaign)} style={styles.saveButton}><Text style={styles.saveButtonText}>Düzenle</Text></Pressable>
          </View>
        </View>
      ))}
    </>
  );
}

type CategoryDraft = {
  id?: number;
  name: string;
  displayOrder: string;
  isActive: boolean;
};

type MenuItemDraft = {
  id?: number;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  isAvailable: boolean;
  preparationMinutes: string;
};

function MenuTab({
  data,
  apiBaseUrl,
  onChanged
}: {
  data: AdminDashboardDto;
  apiBaseUrl: string;
  onChanged: () => void | Promise<void>;
}) {
  const categories = [...data.categories].sort((left, right) => left.displayOrder - right.displayOrder);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [menuItemDraft, setMenuItemDraft] = useState<MenuItemDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function openNewCategory() {
    setMenuItemDraft(null);
    setCategoryDraft({
      name: "",
      displayOrder: String((categories.at(-1)?.displayOrder ?? 0) + 1),
      isActive: true
    });
  }

  function openCategory(category: AdminCategoryDto) {
    setMenuItemDraft(null);
    setCategoryDraft({
      id: category.id,
      name: category.name,
      displayOrder: String(category.displayOrder),
      isActive: category.isActive
    });
  }

  function openNewMenuItem() {
    if (!categories.length) {
      Alert.alert("Kategori gerekli", "Önce en az bir kategori oluşturun.");
      return;
    }

    setCategoryDraft(null);
    setMenuItemDraft({
      categoryId: String(categories[0]!.id),
      name: "",
      description: "",
      price: "",
      imageUrl: "",
      isAvailable: true,
      preparationMinutes: "10"
    });
  }

  function openMenuItem(item: MenuItemDto) {
    setCategoryDraft(null);
    setMenuItemDraft({
      id: item.id,
      categoryId: String(item.categoryId),
      name: item.name,
      description: item.description,
      price: String(item.price).replace(".", ","),
      imageUrl: item.imageUrl ?? "",
      isAvailable: item.isAvailable,
      preparationMinutes: String(item.preparationMinutes)
    });
  }

  async function saveCategory() {
    if (!categoryDraft?.name.trim()) {
      Alert.alert("Eksik bilgi", "Kategori adı zorunludur.");
      return;
    }

    const displayOrder = Number.parseInt(categoryDraft.displayOrder, 10);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      Alert.alert("Geçersiz sıra", "Sıra değeri sıfır veya daha büyük olmalıdır.");
      return;
    }

    setIsSaving(true);
    try {
      const input = {
        name: categoryDraft.name.trim(),
        displayOrder,
        isActive: categoryDraft.isActive
      };
      if (categoryDraft.id) await updateCategory(apiBaseUrl, categoryDraft.id, input);
      else await createCategory(apiBaseUrl, input);
      setCategoryDraft(null);
      await onChanged();
    } catch (reason) {
      Alert.alert("Kategori kaydedilemedi", reason instanceof Error ? reason.message : "İstek başarısız oldu.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveMenuItem() {
    if (!menuItemDraft?.name.trim()) {
      Alert.alert("Eksik bilgi", "Ürün adı zorunludur.");
      return;
    }

    const categoryId = Number.parseInt(menuItemDraft.categoryId, 10);
    const price = Number(menuItemDraft.price.replace(",", "."));
    const preparationMinutes = Number.parseInt(menuItemDraft.preparationMinutes, 10);
    if (!categoryId || !Number.isFinite(price) || price < 0 || !Number.isInteger(preparationMinutes) || preparationMinutes < 0) {
      Alert.alert("Geçersiz bilgi", "Kategori, fiyat ve hazırlama süresini kontrol edin.");
      return;
    }

    setIsSaving(true);
    try {
      const input = {
        categoryId,
        name: menuItemDraft.name.trim(),
        description: menuItemDraft.description.trim(),
        price,
        imageUrl: menuItemDraft.imageUrl.trim() || null,
        isAvailable: menuItemDraft.isAvailable,
        preparationMinutes
      };
      if (menuItemDraft.id) await updateMenuItem(apiBaseUrl, menuItemDraft.id, input);
      else await createMenuItem(apiBaseUrl, input);
      setMenuItemDraft(null);
      await onChanged();
    } catch (reason) {
      Alert.alert("Ürün kaydedilemedi", reason instanceof Error ? reason.message : "İstek başarısız oldu.");
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDeleteCategory(category: AdminCategoryDto) {
    Alert.alert(
      "Kategoriyi sil",
      `"${category.name}" kategorisi silinsin mi? İçinde ürün varsa silme işlemi reddedilebilir.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: () => void (async () => {
            try {
              await deleteCategory(apiBaseUrl, category.id);
              await onChanged();
            } catch (reason) {
              Alert.alert("Kategori silinemedi", reason instanceof Error ? reason.message : "İstek başarısız oldu.");
            }
          })()
        }
      ]
    );
  }

  function confirmDeleteMenuItem(item: MenuItemDto) {
    Alert.alert("Ürünü sil", `"${item.name}" ürünü silinsin mi?`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: () => void (async () => {
          try {
            await deleteMenuItem(apiBaseUrl, item.id);
            await onChanged();
          } catch (reason) {
            Alert.alert("Ürün silinemedi", reason instanceof Error ? reason.message : "İstek başarısız oldu.");
          }
        })()
      }
    ]);
  }

  return (
    <>
      <Text style={styles.pageTitle}>Menü yönetimi</Text>
      <Text style={styles.pageSubtitle}>{data.menuItems.length} ürün · {categories.length} kategori</Text>
      <View style={styles.menuToolbar}>
        <Pressable onPress={openNewCategory} style={styles.menuToolbarButton}>
          <Text style={styles.menuToolbarButtonText}>+ Kategori</Text>
        </Pressable>
        <Pressable onPress={openNewMenuItem} style={styles.menuToolbarButton}>
          <Text style={styles.menuToolbarButtonText}>+ Ürün</Text>
        </Pressable>
      </View>

      {categoryDraft ? (
        <View style={styles.editorCard}>
          <Text style={styles.editorTitle}>{categoryDraft.id ? "Kategoriyi düzenle" : "Kategori ekle"}</Text>
          <Text style={styles.editorLabel}>Kategori adı</Text>
          <TextInput
            onChangeText={(name) => setCategoryDraft((current) => current ? { ...current, name } : current)}
            placeholder="Örn. Ana yemekler"
            style={styles.editorInput}
            value={categoryDraft.name}
          />
          <Text style={styles.editorLabel}>Görüntüleme sırası</Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={(displayOrder) => setCategoryDraft((current) => current ? { ...current, displayOrder } : current)}
            style={styles.editorInput}
            value={categoryDraft.displayOrder}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Aktif</Text>
            <Switch
              onValueChange={(isActive) => setCategoryDraft((current) => current ? { ...current, isActive } : current)}
              trackColor={{ false: "#cbd4d2", true: "#8ed3bd" }}
              value={categoryDraft.isActive}
            />
          </View>
          <View style={styles.editorActions}>
            <Pressable disabled={isSaving} onPress={() => setCategoryDraft(null)} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>İptal</Text>
            </Pressable>
            <Pressable disabled={isSaving} onPress={() => void saveCategory()} style={styles.saveButton}>
              {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Kaydet</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {menuItemDraft ? (
        <View style={styles.editorCard}>
          <Text style={styles.editorTitle}>{menuItemDraft.id ? "Ürünü düzenle" : "Ürün ekle"}</Text>
          <Text style={styles.editorLabel}>Kategori</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categorySelector}>
            {categories.map((category) => {
              const selected = menuItemDraft.categoryId === String(category.id);
              return (
                <Pressable
                  key={category.id}
                  onPress={() => setMenuItemDraft((current) => current ? { ...current, categoryId: String(category.id) } : current)}
                  style={[styles.categoryChoice, selected ? styles.categoryChoiceActive : null]}
                >
                  <Text style={[styles.categoryChoiceText, selected ? styles.categoryChoiceTextActive : null]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.editorLabel}>Ürün adı</Text>
          <TextInput
            onChangeText={(name) => setMenuItemDraft((current) => current ? { ...current, name } : current)}
            style={styles.editorInput}
            value={menuItemDraft.name}
          />
          <Text style={styles.editorLabel}>Açıklama</Text>
          <TextInput
            multiline
            onChangeText={(description) => setMenuItemDraft((current) => current ? { ...current, description } : current)}
            style={[styles.editorInput, styles.editorTextArea]}
            value={menuItemDraft.description}
          />
          <View style={styles.editorColumns}>
            <View style={styles.editorColumn}>
              <Text style={styles.editorLabel}>Fiyat</Text>
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={(price) => setMenuItemDraft((current) => current ? { ...current, price } : current)}
                placeholder="0,00"
                style={styles.editorInput}
                value={menuItemDraft.price}
              />
            </View>
            <View style={styles.editorColumn}>
              <Text style={styles.editorLabel}>Hazırlama (dk)</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={(preparationMinutes) => setMenuItemDraft((current) => current ? { ...current, preparationMinutes } : current)}
                style={styles.editorInput}
                value={menuItemDraft.preparationMinutes}
              />
            </View>
          </View>
          <Text style={styles.editorLabel}>Görsel yolu</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={(imageUrl) => setMenuItemDraft((current) => current ? { ...current, imageUrl } : current)}
            placeholder="/images/menu/urun.jpg"
            style={styles.editorInput}
            value={menuItemDraft.imageUrl}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Satışta</Text>
            <Switch
              onValueChange={(isAvailable) => setMenuItemDraft((current) => current ? { ...current, isAvailable } : current)}
              trackColor={{ false: "#cbd4d2", true: "#8ed3bd" }}
              value={menuItemDraft.isAvailable}
            />
          </View>
          <View style={styles.editorActions}>
            <Pressable disabled={isSaving} onPress={() => setMenuItemDraft(null)} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>İptal</Text>
            </Pressable>
            <Pressable disabled={isSaving} onPress={() => void saveMenuItem()} style={styles.saveButton}>
              {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Kaydet</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {categories.map((category) => {
        const items = data.menuItems.filter((item) => item.categoryId === category.id);
        return (
          <Panel
            key={category.id}
            title={category.name}
            subtitle={`${items.length} ürün · ${category.isActive ? "Aktif" : "Pasif"}`}
          >
            <View style={styles.rowActions}>
              <Pressable onPress={() => openCategory(category)} style={styles.editButton}>
                <Text style={styles.editButtonText}>Kategoriyi düzenle</Text>
              </Pressable>
              <Pressable onPress={() => confirmDeleteCategory(category)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>Sil</Text>
              </Pressable>
            </View>
            {items.length === 0 ? <EmptyState text="Bu kategoride ürün yok." compact /> : items.map((item) => (
              <MenuItemRow
                key={item.id}
                item={item}
                apiBaseUrl={apiBaseUrl}
                onDelete={() => confirmDeleteMenuItem(item)}
                onEdit={() => openMenuItem(item)}
              />
            ))}
          </Panel>
        );
      })}
    </>
  );
}

function MenuItemRow({
  item,
  apiBaseUrl,
  onEdit,
  onDelete
}: {
  item: MenuItemDto;
  apiBaseUrl: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const imageUrl = item.imageUrl
    ? item.imageUrl.startsWith("http")
      ? item.imageUrl
      : `${apiBaseUrl}${item.imageUrl.startsWith("/") ? "" : "/"}${item.imageUrl}`
    : null;

  return (
    <View style={styles.menuItem}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.menuImage} />
      ) : <View style={styles.menuPlaceholder}><Text style={styles.menuPlaceholderText}>🍽️</Text></View>}
      <View style={styles.flex}>
        <Text style={styles.menuName}>{item.name}</Text>
        <Text numberOfLines={2} style={styles.menuDescription}>{item.description || "Açıklama yok"}</Text>
        <Text style={item.isAvailable ? styles.available : styles.unavailable}>
          {item.isAvailable ? "Satışta" : "Satışta değil"} · {item.preparationMinutes} dk
        </Text>
      </View>
      <View style={styles.menuItemEnd}>
        <Text style={styles.menuPrice}>{money.format(item.price)}</Text>
        <View style={styles.compactActions}>
          <Pressable onPress={onEdit} style={styles.compactEditButton}>
            <Text style={styles.compactEditText}>Düzenle</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={styles.compactDeleteButton}>
            <Text style={styles.compactDeleteText}>Sil</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ReportsTab({
  analytics,
  data,
  days,
  onDaysChange
}: {
  analytics: AdminAnalyticsDto | null;
  data: AdminDashboardDto;
  days: number;
  onDaysChange: (days: number) => void;
}) {
  return (
    <>
      <Text style={styles.pageTitle}>Satış raporları</Text>
      <Text style={styles.pageSubtitle}>Ciro ve ürün performansını mobilden takip edin</Text>
      <View style={styles.periodSelector}>
        {[7, 30].map((period) => (
          <Pressable
            key={period}
            onPress={() => onDaysChange(period)}
            style={[styles.periodButton, days === period ? styles.periodButtonActive : null]}
          >
            <Text style={[styles.periodText, days === period ? styles.periodTextActive : null]}>
              Son {period} gün
            </Text>
          </Pressable>
        ))}
      </View>

      {!analytics ? <ActivityIndicator color="#168569" size="large" /> : (
        <>
          <Panel title="Seçili dönem cirosu" subtitle={`${formatDate(analytics.revenue.startDate)} – ${formatDate(analytics.revenue.endDate)}`}>
            <Text style={styles.reportRevenue}>{money.format(analytics.revenue.totalRevenue)}</Text>
            <RevenueChart analytics={analytics} />
          </Panel>

          <Panel title="En çok satan ürünler" subtitle="Satış adedine göre ilk 5">
            {analytics.topItems.length === 0 ? <EmptyState text="Bu dönemde satış yok." compact /> : analytics.topItems.map((item, index) => (
              <RankRow key={item.menuItemId} rank={index + 1} name={item.name} quantity={item.quantity} revenue={item.revenue} />
            ))}
          </Panel>

          <Panel title="En az satan ürünler" subtitle="Satış adedine göre son 5">
            {analytics.bottomItems.length === 0 ? <EmptyState text="Bu dönemde satış yok." compact /> : analytics.bottomItems.map((item, index) => (
              <RankRow key={item.menuItemId} rank={index + 1} name={item.name} quantity={item.quantity} revenue={item.revenue} />
            ))}
          </Panel>
        </>
      )}

      <Panel title="Bugünkü ödeme dağılımı" subtitle={formatDate(data.dailyReport.date)}>
        {data.dailyReport.paymentMethods.length === 0 ? <EmptyState text="Bugün tamamlanan ödeme yok." compact /> : data.dailyReport.paymentMethods.map((payment) => (
          <InfoRow key={payment.method} label={paymentMethodText(payment.method)} value={money.format(payment.total)} />
        ))}
      </Panel>
    </>
  );
}

function RevenueChart({ analytics }: { analytics: AdminAnalyticsDto }) {
  const values = analytics.revenue.dailyRevenue;
  const max = Math.max(1, ...values.map((item) => Number(item.revenue)));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.chart}>
        {values.map((item) => {
          const revenue = Number(item.revenue);
          const height = revenue === 0 ? 3 : Math.max(8, revenue / max * 96);
          return (
            <View key={item.date} style={styles.chartColumn}>
              <Text style={styles.chartValue}>{revenue > 0 ? compactMoney(revenue) : ""}</Text>
              <View style={styles.chartBarSpace}>
                <View style={[styles.chartBar, { height }]} />
              </View>
              <Text style={styles.chartDate}>{shortDate(item.date)}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelSubtitle}>{subtitle}</Text>
      <View style={styles.panelBody}>{children}</View>
    </View>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "green" | "amber" | "blue" | "red" }) {
  return (
    <View style={[styles.statCard, statTone(tone)]}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function RankRow({ rank, name, quantity, revenue }: { rank: number; name: string; quantity: number; revenue: number }) {
  return (
    <View style={styles.rankRow}>
      <View style={styles.rankBadge}><Text style={styles.rankText}>{rank}</Text></View>
      <View style={styles.flex}>
        <Text style={styles.rankName}>{name}</Text>
        <Text style={styles.muted}>{quantity} adet</Text>
      </View>
      <Text style={styles.rankRevenue}>{money.format(revenue)}</Text>
    </View>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return <Text style={[styles.empty, compact ? styles.emptyCompact : null]}>{text}</Text>;
}

function tableStatusText(status: TableStatus) {
  return ({ Empty: "Boş", Occupied: "Dolu", WaitingForPayment: "Hesap bekliyor" } as const)[status];
}

function orderStatusText(status: OrderStatus) {
  return ({
    Pending: "Yeni",
    Preparing: "Hazırlanıyor",
    Ready: "Hazır",
    Delivered: "Tamamlandı",
    Cancelled: "İptal edildi"
  } as const)[status];
}

function paymentMethodText(method: PaymentMethod) {
  return ({ Cash: "Nakit", CreditCard: "Kredi kartı", QrPayment: "QR ödeme" } as const)[method];
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Tarih yok" : date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("tr-TR");
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

function compactMoney(value: number) {
  return value >= 1000 ? `${(value / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}b` : String(Math.round(value));
}

function statTone(tone: "green" | "amber" | "blue" | "red") {
  return {
    green: styles.statGreen,
    amber: styles.statAmber,
    blue: styles.statBlue,
    red: styles.statRed
  }[tone];
}

function tableStyle(status: TableStatus) {
  return status === "Empty"
    ? styles.tableEmpty
    : status === "Occupied"
      ? styles.tableOccupied
      : styles.tablePayment;
}

function orderStatusStyle(status: OrderStatus) {
  return status === "Ready"
    ? styles.orderReady
    : status === "Preparing"
      ? styles.orderPreparing
      : styles.orderPending;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#f3f6f5", flex: 1 },
  flex: { flex: 1 },
  header: { alignItems: "center", backgroundColor: "#112a32", flexDirection: "row", gap: 12, paddingBottom: 16, paddingHorizontal: 18, paddingTop: 12 },
  kicker: { color: "#a8e0cd", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  headerTitle: { color: "#fff", fontSize: 25, fontWeight: "900", marginTop: 2 },
  headerSubtitle: { color: "#c6ddd8", fontSize: 12, marginTop: 3 },
  logoutButton: { backgroundColor: "#2a4650", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
  logoutText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  tabBar: { backgroundColor: "#fff", borderTopColor: "#dfe7e4", borderTopWidth: 1, flexDirection: "row", gap: 4, paddingHorizontal: 7, paddingVertical: 8 },
  tab: { alignItems: "center", borderRadius: 10, flex: 1, justifyContent: "center", minHeight: 43, paddingHorizontal: 2, paddingVertical: 9 },
  activeTab: { backgroundColor: "#168569" },
  tabText: { color: "#52636d", fontSize: 12, fontWeight: "800", textAlign: "center" },
  activeTabText: { color: "#fff" },
  content: { gap: 14, padding: 14, paddingBottom: 42 },
  errorBox: { backgroundColor: "#fff0ef", borderColor: "#f0c4bf", borderRadius: 10, borderWidth: 1, gap: 8, padding: 12 },
  errorText: { color: "#a12d21", fontSize: 13, lineHeight: 18 },
  retryText: { color: "#168569", fontSize: 13, fontWeight: "900" },
  loading: { alignItems: "center", gap: 12, paddingVertical: 80 },
  loadingText: { color: "#52636d", fontSize: 13 },
  sectionEyebrow: { color: "#667b80", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  statCard: { borderRadius: 12, minHeight: 96, padding: 13, width: "48.5%" },
  statGreen: { backgroundColor: "#dff4ec" },
  statAmber: { backgroundColor: "#fff0cf" },
  statBlue: { backgroundColor: "#e2eefb" },
  statRed: { backgroundColor: "#fce4e1" },
  statValue: { color: "#17212b", fontSize: 22, fontWeight: "900" },
  statLabel: { color: "#52636d", fontSize: 12, fontWeight: "700", marginTop: 8 },
  panel: { backgroundColor: "#fff", borderColor: "#e0e7e5", borderRadius: 14, borderWidth: 1, padding: 15 },
  panelTitle: { color: "#17212b", fontSize: 18, fontWeight: "900" },
  panelSubtitle: { color: "#708086", fontSize: 12, marginTop: 3 },
  panelBody: { gap: 1, marginTop: 13 },
  summaryRows: { gap: 1 },
  infoRow: { alignItems: "center", borderTopColor: "#edf1f0", borderTopWidth: 1, flexDirection: "row", gap: 12, minHeight: 44, paddingVertical: 9 },
  infoLabel: { color: "#596a70", flex: 1, fontSize: 13 },
  infoValue: { color: "#17212b", flexShrink: 1, fontSize: 13, fontWeight: "900", textAlign: "right" },
  bigMoney: { color: "#12745d", fontSize: 28, fontWeight: "900", marginBottom: 8 },
  pageTitle: { color: "#17212b", fontSize: 25, fontWeight: "900" },
  pageSubtitle: { color: "#66777d", fontSize: 13, marginTop: -8 },
  orderCard: { backgroundColor: "#fff", borderColor: "#e0e7e5", borderRadius: 13, borderWidth: 1, padding: 14 },
  orderHeader: { alignItems: "center", borderBottomColor: "#e9eeec", borderBottomWidth: 1, flexDirection: "row", gap: 8, paddingBottom: 11 },
  orderTitle: { color: "#17212b", fontSize: 19, fontWeight: "900" },
  muted: { color: "#748187", fontSize: 12, marginTop: 2 },
  statusBadge: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6 },
  statusBadgeText: { color: "#4f3a0b", fontSize: 11, fontWeight: "900" },
  orderPending: { backgroundColor: "#fff0cf" },
  orderPreparing: { backgroundColor: "#ffe1d2" },
  orderReady: { backgroundColor: "#dff4ec" },
  orderItem: { alignItems: "center", borderBottomColor: "#edf1f0", borderBottomWidth: 1, flexDirection: "row", gap: 10, paddingVertical: 10 },
  orderItemName: { color: "#25343a", fontSize: 14, fontWeight: "800" },
  orderNote: { color: "#99600c", fontSize: 12, marginTop: 2 },
  orderItemPrice: { color: "#25343a", fontSize: 12, fontWeight: "800" },
  orderTotal: { alignItems: "center", flexDirection: "row", paddingTop: 12 },
  orderTotalLabel: { color: "#52636d", flex: 1, fontSize: 13, fontWeight: "700" },
  orderTotalValue: { color: "#12745d", fontSize: 17, fontWeight: "900" },
  paymentRequest: { backgroundColor: "#edf8f4", borderRadius: 7, color: "#176b56", fontSize: 12, fontWeight: "800", marginTop: 10, padding: 9 },
  tableGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  tableCard: { borderRadius: 13, minHeight: 160, padding: 13, width: "48.5%" },
  tableEmpty: { backgroundColor: "#e1f4ec" },
  tableOccupied: { backgroundColor: "#fce3df" },
  tablePayment: { backgroundColor: "#fff0cf" },
  tableNumberCircle: { alignItems: "center", backgroundColor: "#ffffffa8", borderRadius: 99, height: 45, justifyContent: "center", width: 45 },
  tableNumber: { color: "#17212b", fontSize: 21, fontWeight: "900" },
  tableStatus: { color: "#17212b", fontSize: 15, fontWeight: "900", marginTop: 10 },
  tableMeta: { color: "#5d6d72", fontSize: 12, marginTop: 2 },
  tableOrder: { color: "#34484f", fontSize: 11, fontWeight: "700", marginTop: 10 },
  menuToolbar: { flexDirection: "row", gap: 8 },
  menuToolbarButton: { alignItems: "center", backgroundColor: "#168569", borderRadius: 9, flex: 1, minHeight: 43, justifyContent: "center", paddingHorizontal: 10 },
  menuToolbarButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  editorCard: { backgroundColor: "#fff", borderColor: "#b8d7cd", borderRadius: 14, borderWidth: 1, gap: 8, padding: 14 },
  editorTitle: { color: "#17212b", fontSize: 18, fontWeight: "900", marginBottom: 3 },
  editorLabel: { color: "#4f6066", fontSize: 12, fontWeight: "800", marginTop: 3 },
  editorInput: { backgroundColor: "#fff", borderColor: "#cbd6d3", borderRadius: 8, borderWidth: 1, color: "#17212b", minHeight: 44, paddingHorizontal: 11, paddingVertical: 9 },
  editorTextArea: { minHeight: 82, textAlignVertical: "top" },
  editorColumns: { flexDirection: "row", gap: 9 },
  editorColumn: { flex: 1 },
  switchRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 44 },
  switchLabel: { color: "#26373d", fontSize: 14, fontWeight: "900" },
  editorActions: { flexDirection: "row", gap: 8, marginTop: 5 },
  cancelButton: { alignItems: "center", backgroundColor: "#e7edeb", borderRadius: 8, flex: 1, justifyContent: "center", minHeight: 43 },
  cancelButtonText: { color: "#4f6066", fontSize: 13, fontWeight: "900" },
  saveButton: { alignItems: "center", backgroundColor: "#168569", borderRadius: 8, flex: 1, justifyContent: "center", minHeight: 43 },
  saveButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  categorySelector: { marginBottom: 3 },
  categoryChoice: { backgroundColor: "#e7edeb", borderRadius: 99, marginRight: 7, paddingHorizontal: 12, paddingVertical: 9 },
  categoryChoiceActive: { backgroundColor: "#168569" },
  categoryChoiceText: { color: "#52636d", fontSize: 12, fontWeight: "800" },
  categoryChoiceTextActive: { color: "#fff" },
  rowActions: { flexDirection: "row", gap: 7, marginBottom: 4 },
  editButton: { alignItems: "center", backgroundColor: "#e3f3ed", borderRadius: 7, flex: 1, minHeight: 37, justifyContent: "center", paddingHorizontal: 8 },
  editButtonText: { color: "#12745d", fontSize: 11, fontWeight: "900" },
  deleteButton: { alignItems: "center", backgroundColor: "#fce7e4", borderRadius: 7, justifyContent: "center", minHeight: 37, paddingHorizontal: 14 },
  deleteButtonText: { color: "#a12d21", fontSize: 11, fontWeight: "900" },
  menuItem: { alignItems: "center", borderTopColor: "#edf1f0", borderTopWidth: 1, flexDirection: "row", gap: 10, paddingVertical: 11 },
  menuImage: { backgroundColor: "#edf1f0", borderRadius: 9, height: 58, width: 58 },
  menuPlaceholder: { alignItems: "center", backgroundColor: "#edf1f0", borderRadius: 9, height: 58, justifyContent: "center", width: 58 },
  menuPlaceholderText: { fontSize: 23 },
  menuName: { color: "#17212b", fontSize: 14, fontWeight: "900" },
  menuDescription: { color: "#718087", fontSize: 11, lineHeight: 15, marginTop: 2 },
  available: { color: "#168569", fontSize: 11, fontWeight: "800", marginTop: 3 },
  unavailable: { color: "#a12d21", fontSize: 11, fontWeight: "800", marginTop: 3 },
  menuPrice: { color: "#17212b", fontSize: 12, fontWeight: "900" },
  menuItemEnd: { alignItems: "flex-end", gap: 7 },
  compactActions: { flexDirection: "row", gap: 5 },
  compactEditButton: { backgroundColor: "#e3f3ed", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 6 },
  compactEditText: { color: "#12745d", fontSize: 10, fontWeight: "900" },
  compactDeleteButton: { backgroundColor: "#fce7e4", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 6 },
  compactDeleteText: { color: "#a12d21", fontSize: 10, fontWeight: "900" },
  periodSelector: { backgroundColor: "#e4ebe8", borderRadius: 10, flexDirection: "row", gap: 5, padding: 4 },
  periodButton: { alignItems: "center", borderRadius: 8, flex: 1, paddingVertical: 10 },
  periodButtonActive: { backgroundColor: "#168569" },
  periodText: { color: "#53656b", fontSize: 13, fontWeight: "800" },
  periodTextActive: { color: "#fff" },
  reportRevenue: { color: "#12745d", fontSize: 30, fontWeight: "900", marginBottom: 10 },
  rankRow: { alignItems: "center", borderTopColor: "#edf1f0", borderTopWidth: 1, flexDirection: "row", gap: 10, minHeight: 54, paddingVertical: 8 },
  rankBadge: { alignItems: "center", backgroundColor: "#e3f3ed", borderRadius: 99, height: 30, justifyContent: "center", width: 30 },
  rankText: { color: "#12745d", fontSize: 12, fontWeight: "900" },
  rankName: { color: "#17212b", fontSize: 13, fontWeight: "900" },
  rankRevenue: { color: "#17212b", fontSize: 12, fontWeight: "900" },
  chart: { alignItems: "flex-end", flexDirection: "row", gap: 9, minHeight: 140, paddingBottom: 3, paddingTop: 6 },
  chartColumn: { alignItems: "center", width: 48 },
  chartValue: { color: "#52636d", fontSize: 9, fontWeight: "800", height: 15 },
  chartBarSpace: { alignItems: "center", height: 100, justifyContent: "flex-end", width: "100%" },
  chartBar: { backgroundColor: "#22a47d", borderRadius: 5, minHeight: 3, width: 25 },
  chartDate: { color: "#6e7d82", fontSize: 9, marginTop: 5 },
  empty: { color: "#6b7c81", fontSize: 13, paddingVertical: 60, textAlign: "center" },
  emptyCompact: { paddingVertical: 20 }
});
