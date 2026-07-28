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
cd .\RestaurantApp
dotnet run
```

Ardından mobil projeyi başlatın:

```powershell
cd .\customer-mobile
.\start-expo.cmd
```

Native uygulamanın API adresi `EXPO_PUBLIC_API_URL` ile derleme sırasında
belirlenir. Yerel ayarı oluşturmak için `.env.example` dosyasını `.env.local`
adıyla kopyalayın ve kendi API adresinizi yazın:

```powershell
Copy-Item .\.env.example .\.env.local
```

`.env.local` Git tarafından izlenmez. Dosya yoksa native uygulama
`http://localhost:5223` adresini kullanır. Fiziksel telefonda kullanılacak adres
HTTPS üzerinden erişilebilir olmalıdır.

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

Build betiği, varsa `.env.local` değerlerini EAS `preview` ortamına yükler;
böylece kişisel API adresi `eas.json` veya Git geçmişine yazılmaz.

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
- Mağaza API bağlantısı HTTPS kullanmalıdır. Mağaza sürümünden önce Android
  `usesCleartextTraffic` ayarı kapatılmalıdır.
