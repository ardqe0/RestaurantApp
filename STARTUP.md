# Tüm uygulamaları başlatma

## İlk kurulum

Yerel JWT anahtarını ve isteğe bağlı başlangıç hesaplarını oluşturmak için
`RestaurantApp/appsettings.Development.example.json` dosyasını
`RestaurantApp/appsettings.Development.json` adıyla kopyalayın ve örnek değerleri
değiştirin. Gerçek anahtar ve şifrelerin bulunduğu dosya Git tarafından izlenmez.

Veritabanını hazırlayın:

```powershell
cd C:\Users\example\source\repos\RestaurantApp\RestaurantApp
dotnet ef database update
```

Tek portta API, müşteri ve mutfak uygulamasını başlatmak için kök klasörde:

```powershell
cd C:\Users\example\source\repos\RestaurantApp
.\start-all.cmd
```

Komutun çalıştırıldığı terminalde tüm web uygulamaları tek portta çalışır:

- Giriş: `http://localhost:5223/`
- Müşteri: `http://localhost:5223/customer`
- Mutfak: `http://localhost:5223/kitchen`
- Yönetim: `http://localhost:5223/admin/`
- Swagger: `http://localhost:5223/swagger`

Visual Studio ile hata ayıklamak için API projesini `F5` ile başlatman yeterlidir.

## Başlangıç mutfak ve yönetici hesapları

Yeni bir veritabanında mutfak veya yönetici hesabını otomatik oluşturmak için backend'i ilk kez başlatmadan önce aşağıdaki çevre değişkenlerini kendi güvenli bilgilerinizle tanımlayın:

```powershell
$env:BootstrapUsers__Kitchen__Username="mutfak-kullanici-adi"
$env:BootstrapUsers__Kitchen__Password="guclu-bir-sifre"
$env:BootstrapUsers__Admin__Username="yonetici-kullanici-adi"
$env:BootstrapUsers__Admin__Password="guclu-bir-sifre"
```

Bu bilgiler kaynak kodda veya giriş ekranında gösterilmez.

Yeni kayıt olan kullanıcılar yalnızca `Customer` rolünü alır. `Kitchen` ve
`Admin` rolleri kullanıcı arayüzünden atanamaz.

## React yönetim panelini yeniden derleme

Yönetim panelinin kaynak kodu `admin-web` klasöründedir. React kodunda değişiklik
yaptıktan sonra yeni üretim dosyalarını ASP.NET projesine almak için:

```powershell
cd C:\Users\example\source\repos\RestaurantApp\admin-web
pnpm install
pnpm run build
```

Derleme sonucu otomatik olarak `RestaurantApp\wwwroot\admin` klasörüne yazılır.

Müşteri ve mutfak web çıktıları için sırasıyla:

```powershell
cd C:\Users\example\source\repos\RestaurantApp\customer-mobile
.\pnpm-local.cmd run build:web

cd C:\Users\example\source\repos\RestaurantApp\kitchen-kds
..\customer-mobile\pnpm-local.cmd run build:web
```
