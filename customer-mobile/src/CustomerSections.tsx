import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { changePassword, updateProfile } from "./auth";
import type { AuthSession } from "./auth";
import type { MenuItemDto, OrderDto } from "./types";

export type CustomerSection = "order" | "account";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2
});

export function CustomerBottomNavigation({
  activeSection,
  onChange
}: {
  activeSection: CustomerSection;
  onChange: (section: CustomerSection) => void;
}) {
  const items: { key: CustomerSection; label: string; icon: string }[] = [
    { key: "order", label: "Sipariş", icon: "▣" },
    { key: "account", label: "Hesabım", icon: "◆" }
  ];

  return (
    <View style={styles.bottomNavigation}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onChange(item.key)}
          style={[styles.bottomNavigationItem, activeSection === item.key ? styles.bottomNavigationItemActive : null]}
        >
          <View style={styles.bottomNavigationIconBox}>
            <Text
              style={[
                styles.bottomNavigationIcon,
                activeSection === item.key ? styles.bottomNavigationIconActive : null
              ]}
            >
              {item.icon}
            </Text>
          </View>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            numberOfLines={1}
            style={[styles.bottomNavigationText, activeSection === item.key ? styles.bottomNavigationTextActive : null]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function AccountSection({
  apiBaseUrl,
  session,
  onSessionChange,
  onLogout,
  favorites,
  canOrder,
  onRemoveFavorite,
  onAddToCart,
  onGoToScanner,
  orders,
  isHistoryLoading,
  onRefreshHistory,
  onReorder,
  onReview
}: {
  apiBaseUrl: string;
  session: AuthSession;
  onSessionChange: (session: AuthSession) => void;
  onLogout: () => void | Promise<void>;
  favorites: MenuItemDto[];
  canOrder: boolean;
  onRemoveFavorite: (menuItemId: number) => void | Promise<void>;
  onAddToCart: (item: MenuItemDto) => void;
  onGoToScanner: () => void;
  orders: OrderDto[];
  isHistoryLoading: boolean;
  onRefreshHistory: () => void | Promise<void>;
  onReorder: (order: OrderDto) => void;
  onReview: (order: OrderDto) => void;
}) {
  const [email, setEmail] = useState(session.email ?? "");
  const [phoneNumber, setPhoneNumber] = useState(session.phoneNumber ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<"profile" | "favorites" | "history" | null>(null);

  async function saveProfile() {
    setIsSavingProfile(true);
    setError(null);
    setMessage(null);
    try {
      const nextSession = await updateProfile(apiBaseUrl, email.trim(), phoneNumber.trim());
      onSessionChange(nextSession);
      setMessage("Hesap bilgileriniz güncellendi.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profil güncellenemedi.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function savePassword() {
    if (!isStrongPassword(newPassword)) {
      setError("Yeni şifre en az 8 karakter; büyük harf, küçük harf, rakam ve özel karakter içermelidir.");
      return;
    }

    setIsChangingPassword(true);
    setError(null);
    setMessage(null);
    try {
      await changePassword(apiBaseUrl, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Şifreniz değiştirildi.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Şifre değiştirilemedi.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.kicker}>MÜŞTERİ HESABI</Text>
        <Text style={styles.title}>Hesabım</Text>
      </View>

      <View style={styles.accountCard}>
        <View style={styles.accountAvatar}>
          <Text style={styles.accountAvatarText}>{session.username.slice(0, 1).toLocaleUpperCase("tr-TR")}</Text>
        </View>
        <Text style={styles.accountName}>{session.username}</Text>
        <Text style={styles.accountRole}>Müşteri hesabı</Text>

        <View style={styles.accountMenus}>
          <Pressable
            onPress={() => setOpenMenu(openMenu === "profile" ? null : "profile")}
            style={[styles.accountMenuHeader, openMenu === "profile" ? styles.accountMenuHeaderOpen : null]}
          >
            <Text style={styles.accountMenuTitle}>Bilgilerinizi Güncelleyin</Text>
            <Text style={styles.accountMenuArrow}>{openMenu === "profile" ? "−" : "+"}</Text>
          </Pressable>
          {openMenu === "profile" ? (
            <View style={styles.accountMenuContent}>
              <View style={styles.embeddedForm}>
                <Text style={styles.formTitle}>İletişim bilgileri</Text>
                <Text style={styles.label}>E-posta</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="ornek@eposta.com"
                  style={styles.input}
                  value={email}
                />
                <Text style={styles.label}>Telefon</Text>
                <TextInput
                  autoComplete="tel"
                  keyboardType="phone-pad"
                  onChangeText={setPhoneNumber}
                  placeholder="05xx xxx xx xx"
                  style={styles.input}
                  value={phoneNumber}
                />
                <Pressable disabled={isSavingProfile} onPress={() => void saveProfile()} style={styles.primaryButton}>
                  {isSavingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Bilgileri güncelle</Text>}
                </Pressable>
              </View>

              <View style={styles.embeddedForm}>
                <Text style={styles.formTitle}>Şifre değiştir</Text>
                <TextInput
                  autoComplete="current-password"
                  onChangeText={setCurrentPassword}
                  placeholder="Mevcut şifre"
                  secureTextEntry
                  style={styles.input}
                  value={currentPassword}
                />
                <TextInput
                  autoComplete="new-password"
                  onChangeText={setNewPassword}
                  placeholder="Yeni şifre"
                  secureTextEntry
                  style={styles.input}
                  value={newPassword}
                />
                <Pressable
                  disabled={isChangingPassword || !currentPassword || !newPassword}
                  onPress={() => void savePassword()}
                  style={[styles.secondaryButton, !currentPassword || !newPassword ? styles.disabled : null]}
                >
                  {isChangingPassword ? <ActivityIndicator color="#fff" /> : <Text style={styles.secondaryButtonText}>Şifreyi değiştir</Text>}
                </Pressable>
              </View>

              {message ? <Text style={styles.success}>{message}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          ) : null}

          <Pressable
            onPress={() => setOpenMenu(openMenu === "favorites" ? null : "favorites")}
            style={[styles.accountMenuHeader, openMenu === "favorites" ? styles.accountMenuHeaderOpen : null]}
          >
            <Text style={styles.accountMenuTitle}>Favorileriniz</Text>
            <Text style={styles.accountMenuArrow}>{openMenu === "favorites" ? "−" : "+"}</Text>
          </Pressable>
          {openMenu === "favorites" ? (
            <View style={styles.accountMenuContent}>
              <FavoritesSection
                embedded
                favorites={favorites}
                apiBaseUrl={apiBaseUrl}
                canOrder={canOrder}
                onRemove={onRemoveFavorite}
                onAddToCart={onAddToCart}
                onGoToScanner={onGoToScanner}
              />
            </View>
          ) : null}

          <Pressable
            onPress={() => setOpenMenu(openMenu === "history" ? null : "history")}
            style={[styles.accountMenuHeader, openMenu === "history" ? styles.accountMenuHeaderOpen : null]}
          >
            <Text style={styles.accountMenuTitle}>Geçmiş Siparişleriniz</Text>
            <Text style={styles.accountMenuArrow}>{openMenu === "history" ? "−" : "+"}</Text>
          </Pressable>
          {openMenu === "history" ? (
            <View style={styles.accountMenuContent}>
              <HistorySection
                embedded
                orders={orders}
                isLoading={isHistoryLoading}
                onRefresh={onRefreshHistory}
                onReorder={onReorder}
                onReview={onReview}
              />
            </View>
          ) : null}
        </View>

        <Pressable onPress={() => void onLogout()} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Çıkış yap</Text>
        </Pressable>
      </View>
    </>
  );
}

function isStrongPassword(password: string) {
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export function HistorySection({
  orders,
  isLoading,
  onRefresh,
  onReorder,
  onReview,
  embedded = false
}: {
  orders: OrderDto[];
  isLoading: boolean;
  onRefresh: () => void | Promise<void>;
  onReorder: (order: OrderDto) => void;
  onReview: (order: OrderDto) => void;
  embedded?: boolean;
}) {
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  return (
    <>
      <View style={embedded ? styles.embeddedRefreshRow : styles.pageHeading}>
        {!embedded ? (
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>HESABIM</Text>
            <Text style={styles.title}>Geçmiş siparişler</Text>
          </View>
        ) : <View style={{ flex: 1 }} />}
        <Pressable onPress={() => void onRefresh()} style={styles.refreshButton}>
          <Text style={styles.refreshText}>{isLoading ? "Yükleniyor…" : "Yenile"}</Text>
        </Pressable>
      </View>

      {orders.length === 0 && !isLoading ? <Text style={styles.empty}>Henüz hesabınıza bağlı sipariş yok.</Text> : null}
      {orders.map((order) => {
        const expanded = expandedOrderId === order.id;
        return (
          <View key={order.id} style={styles.orderCard}>
            <Pressable onPress={() => setExpandedOrderId(expanded ? null : order.id)} style={styles.orderCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderTitle}>Sipariş #{order.id} · Masa {order.tableNumber}</Text>
                <Text style={styles.meta}>{new Date(order.createdAt).toLocaleString("tr-TR")}</Text>
              </View>
              <Text style={styles.orderAmount}>{money.format(order.totalAmount)}</Text>
            </Pressable>
            <Text style={styles.orderStatus}>{statusText(order.status)}</Text>
            {order.status === "Delivered" ? (
              <Pressable onPress={() => onReview(order)} style={styles.quickReviewButton}>
                <Text style={styles.quickReviewStars}>
                  {order.review ? `${"★".repeat(order.review.rating)}${"☆".repeat(5 - order.review.rating)}` : "☆☆☆☆☆"}
                </Text>
                <Text style={styles.quickReviewText}>
                  {order.review ? "Değerlendirmeyi düzenle" : "Puan ver ve yorum yap"}
                </Text>
              </Pressable>
            ) : null}
            {expanded ? (
              <View style={styles.orderDetails}>
                {order.items.map((item) => (
                  <View key={item.id} style={styles.orderItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderItemName}>{item.quantity}× {item.menuItemName}</Text>
                      {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
                    </View>
                    <Text style={styles.meta}>{money.format(item.quantity * item.unitPrice)}</Text>
                  </View>
                ))}
                {order.status === "Delivered" ? (
                  <View style={styles.reviewSummary}>
                    {order.review ? (
                      <>
                        <Text style={styles.reviewStars}>
                          {"★".repeat(order.review.rating)}{"☆".repeat(5 - order.review.rating)}
                        </Text>
                        {order.review.comment ? <Text style={styles.reviewComment}>{order.review.comment}</Text> : null}
                      </>
                    ) : (
                      <Text style={styles.reviewHint}>Bu siparişi henüz değerlendirmediniz.</Text>
                    )}
                    <Pressable onPress={() => onReview(order)} style={styles.reviewButton}>
                      <Text style={styles.reviewButtonText}>
                        {order.review ? "Değerlendirmeyi düzenle" : "Siparişi değerlendir"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                <Pressable onPress={() => onReorder(order)} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Tekrar sipariş ver</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

export function FavoritesSection({
  favorites,
  apiBaseUrl,
  canOrder,
  onRemove,
  onAddToCart,
  onGoToScanner,
  embedded = false
}: {
  favorites: MenuItemDto[];
  apiBaseUrl: string;
  canOrder: boolean;
  onRemove: (menuItemId: number) => void | Promise<void>;
  onAddToCart: (item: MenuItemDto) => void;
  onGoToScanner: () => void;
  embedded?: boolean;
}) {
  return (
    <>
      {!embedded ? (
        <>
          <Text style={styles.kicker}>HESABIM</Text>
          <Text style={styles.title}>Favoriler</Text>
        </>
      ) : null}
      {favorites.length === 0 ? <Text style={styles.empty}>Henüz favori ürün eklemediniz.</Text> : favorites.map((item) => {
        const imageUrl = item.imageUrl
          ? new URL(item.imageUrl, `${apiBaseUrl.replace(/\/$/, "")}/`).toString()
          : null;
        return (
          <View key={item.id} style={styles.favoriteCard}>
            {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.favoriteImage} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.favoriteName}>{item.name}</Text>
              <Text numberOfLines={2} style={styles.meta}>{item.description}</Text>
              <Text style={styles.favoritePrice}>{money.format(item.price)}</Text>
            </View>
            <View style={styles.favoriteActions}>
              <Pressable
                onPress={() => canOrder ? onAddToCart(item) : onGoToScanner()}
                style={styles.smallPrimaryButton}
              >
                <Text style={styles.smallPrimaryText}>{canOrder ? "Sepete ekle" : "QR okut"}</Text>
              </Pressable>
              <Pressable onPress={() => void onRemove(item.id)} style={styles.removeButton}>
                <Text style={styles.removeText}>Kaldır</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </>
  );
}

function statusText(status: string) {
  return ({
    Pending: "Alındı",
    Preparing: "Hazırlanıyor",
    Ready: "Hazır",
    Delivered: "Tamamlandı",
    Cancelled: "İptal edildi"
  } as Record<string, string>)[status] ?? status;
}

const styles = StyleSheet.create({
  bottomNavigation: { backgroundColor: "#fff", borderTopColor: "#dce1e7", borderTopWidth: 1, flexDirection: "row", gap: 5, paddingHorizontal: 8, paddingVertical: 8 },
  bottomNavigationItem: { alignItems: "center", borderRadius: 10, flex: 1, justifyContent: "center", minHeight: 52, paddingHorizontal: 2 },
  bottomNavigationItemActive: { backgroundColor: "#146c5f" },
  bottomNavigationIconBox: { alignItems: "center", height: 25, justifyContent: "center", width: 28 },
  bottomNavigationIcon: { color: "#62717c", fontSize: 22, fontWeight: "900", lineHeight: 25, textAlign: "center" },
  bottomNavigationIconActive: { color: "#fff" },
  bottomNavigationText: { color: "#62717c", fontSize: 10, fontWeight: "900", marginTop: 1, textAlign: "center" },
  bottomNavigationTextActive: { color: "#fff" },
  sectionHeader: { marginBottom: 2 },
  pageHeading: { alignItems: "center", flexDirection: "row", gap: 10 },
  kicker: { color: "#5d6673", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  title: { color: "#14171a", fontSize: 28, fontWeight: "900" },
  accountCard: { alignItems: "center", backgroundColor: "#fff", borderColor: "#dce1e7", borderRadius: 14, borderWidth: 1, padding: 18 },
  accountAvatar: { alignItems: "center", backgroundColor: "#dff2eb", borderRadius: 36, height: 72, justifyContent: "center", width: 72 },
  accountAvatarText: { color: "#146c5f", fontSize: 30, fontWeight: "900" },
  accountName: { color: "#14171a", fontSize: 22, fontWeight: "900", marginTop: 12 },
  accountRole: { color: "#697582", fontSize: 13, marginTop: 3 },
  accountMenus: { gap: 10, marginTop: 20, width: "100%" },
  accountMenuHeader: { alignItems: "center", backgroundColor: "#f4f7f8", borderColor: "#d4dde0", borderRadius: 10, borderWidth: 1, flexDirection: "row", minHeight: 52, paddingHorizontal: 14 },
  accountMenuHeaderOpen: { backgroundColor: "#e7f2ef", borderColor: "#8fc3b7" },
  accountMenuTitle: { color: "#26313d", flex: 1, fontSize: 15, fontWeight: "900" },
  accountMenuArrow: { color: "#146c5f", fontSize: 24, fontWeight: "900" },
  accountMenuContent: { backgroundColor: "#fafcfc", borderColor: "#e0e6e8", borderRadius: 10, borderWidth: 1, gap: 10, padding: 12 },
  embeddedForm: { gap: 8, width: "100%" },
  embeddedRefreshRow: { alignItems: "center", flexDirection: "row", marginBottom: 2 },
  form: { gap: 8, marginTop: 22, width: "100%" },
  formTitle: { color: "#26313d", fontSize: 16, fontWeight: "900" },
  label: { color: "#4d5965", fontSize: 12, fontWeight: "800" },
  input: { borderColor: "#c8d3d5", borderRadius: 8, borderWidth: 1, color: "#17212b", minHeight: 46, paddingHorizontal: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#146c5f", borderRadius: 8, justifyContent: "center", minHeight: 45, paddingHorizontal: 14 },
  primaryButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  secondaryButton: { alignItems: "center", backgroundColor: "#31475d", borderRadius: 8, justifyContent: "center", minHeight: 45 },
  secondaryButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  success: { backgroundColor: "#edf8f4", borderRadius: 8, color: "#176b56", marginTop: 12, padding: 10, width: "100%" },
  error: { backgroundColor: "#fff0ef", borderRadius: 8, color: "#a12d21", marginTop: 12, padding: 10, width: "100%" },
  logoutButton: { alignItems: "center", backgroundColor: "#b83a31", borderRadius: 9, justifyContent: "center", marginTop: 20, minHeight: 47, width: "100%" },
  logoutText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  refreshButton: { backgroundColor: "#e7f2ef", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  refreshText: { color: "#146c5f", fontSize: 12, fontWeight: "900" },
  empty: { backgroundColor: "#fff", borderColor: "#dce1e7", borderRadius: 12, borderWidth: 1, color: "#697582", marginTop: 12, padding: 24, textAlign: "center" },
  orderCard: { backgroundColor: "#fff", borderColor: "#dce1e7", borderRadius: 11, borderWidth: 1, padding: 13 },
  orderCardHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
  orderTitle: { color: "#17212b", fontSize: 14, fontWeight: "900" },
  orderAmount: { color: "#146c5f", fontSize: 14, fontWeight: "900" },
  orderStatus: { color: "#8a6211", fontSize: 12, fontWeight: "800", marginTop: 7 },
  quickReviewButton: { alignItems: "center", backgroundColor: "#fff8e5", borderRadius: 8, flexDirection: "row", gap: 8, marginTop: 9, minHeight: 40, paddingHorizontal: 10 },
  quickReviewStars: { color: "#e39a14", fontSize: 14, letterSpacing: 1 },
  quickReviewText: { color: "#98670d", flex: 1, fontSize: 11, fontWeight: "900", textAlign: "right" },
  orderDetails: { borderTopColor: "#edf0f3", borderTopWidth: 1, gap: 8, marginTop: 10, paddingTop: 8 },
  orderItem: { alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 4 },
  orderItemName: { color: "#26313d", fontSize: 13, fontWeight: "800" },
  note: { color: "#8a6211", fontSize: 11, marginTop: 2 },
  meta: { color: "#697582", fontSize: 11, marginTop: 2 },
  reviewSummary: { backgroundColor: "#fff8e5", borderRadius: 9, gap: 7, marginTop: 4, padding: 11 },
  reviewStars: { color: "#e39a14", fontSize: 21, letterSpacing: 2 },
  reviewComment: { color: "#4d5965", fontSize: 12, lineHeight: 18 },
  reviewHint: { color: "#697582", fontSize: 12 },
  reviewButton: { alignItems: "center", backgroundColor: "#e39a14", borderRadius: 7, minHeight: 39, justifyContent: "center", paddingHorizontal: 10 },
  reviewButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  favoriteCard: { alignItems: "center", backgroundColor: "#fff", borderColor: "#dce1e7", borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 10, padding: 11 },
  favoriteImage: { borderRadius: 8, height: 65, width: 65 },
  favoriteName: { color: "#17212b", fontSize: 14, fontWeight: "900" },
  favoritePrice: { color: "#146c5f", fontSize: 13, fontWeight: "900", marginTop: 5 },
  favoriteActions: { gap: 6 },
  smallPrimaryButton: { backgroundColor: "#146c5f", borderRadius: 7, paddingHorizontal: 9, paddingVertical: 8 },
  smallPrimaryText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  removeButton: { alignItems: "center", paddingVertical: 5 },
  removeText: { color: "#b83a31", fontSize: 10, fontWeight: "800" }
});
