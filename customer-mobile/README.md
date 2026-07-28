# Restoran Otomasyon Mobil

Tek Expo/React Native uygulamasında üç rol bulunur:

- `Customer`: QR kodu okutarak menü, sepet, sipariş ve hesap isteme akışı
- `Kitchen`: canlı mutfak siparişleri, kalem durumu, iptal ve ödeme tamamlama akışı
- `Admin`: işletme özeti, sipariş/masa görünümü, menü yönetimi ve satış raporları

Yeni kayıtlar güvenlik nedeniyle yalnızca `Customer` rolüyle oluşturulur. Mutfak
ve yönetici rolleri backend tarafından atanır.

## Geliştirme

Önce backend'i çalıştırın:

```powershell
cd C:\Users\ardag\source\repos\RestaurantApp\RestaurantApp
dotnet run
```

Ardından mobil projeyi başlatın:

```powershell
cd C:\Users\ardag\source\repos\RestaurantApp\customer-mobile
.\start-expo.cmd
```

Native uygulamanın API adresi `EXPO_PUBLIC_API_URL` ile derleme sırasında
belirlenir. Adres kullanıcı arayüzünde gösterilmez. Preview APK profili şu anda
Tailscale Funnel üzerinden
`http://localhost:5223` adresini kullanır. Backend ve
Funnel çalışır durumda olmalıdır.

## Android APK

İlk derlemeden önce Expo hesabına bir kez giriş yapın:

```powershell
.\login-expo.cmd
```

Ardından:

```powershell
.\build-android-apk.cmd
```

`preview` profili telefona doğrudan kurulabilen `.apk` üretir. Google Play için `production` profili `.aab` üretir ve yayımlamadan önce kalıcı, güvenilir bir HTTPS API adresi kullanılmalıdır.

## OTA güncellemesi

Aynı `runtimeVersion` üzerinde yalnızca JavaScript/TypeScript ve görsel arayüz
değişikliği yayımlamak için:

```powershell
.\publish-preview-update.cmd "Güncelleme açıklaması"
```

## Güvenlik

- Native JWT cihazda `expo-secure-store` ile saklanır.
- Token URL'ye yazılmaz.
- Her rol yalnızca kendi ekranına yönlendirilir.
- Sipariş okuma ve hesap isteme işlemleri sipariş sahibi müşteriyle sınırlandırılır.
- SignalR bağlantısı JWT/cookie ister ve müşteri yalnızca kendi sipariş olaylarını alır.
- Preview API bağlantısı HTTPS kullanır. Mağaza sürümünden önce Android
  `usesCleartextTraffic` ayarı kapatılmalıdır.
