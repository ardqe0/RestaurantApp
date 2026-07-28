# Mutfak / KDS

Aktif siparişleri gösterir ve her kalemi `Bekliyor → Hazırlanıyor → Hazır` akışında ilerletir. Yeni sipariş ve durum değişikliklerini SignalR ile anında alır; bağlantı sorunu olursa 4 saniyelik yenileme devrede kalır.

## Çalıştırma

Önce API'yi başlatın:

```powershell
cd C:\Users\ardag\source\repos\RestaurantApp\RestaurantApp
dotnet run
```

Sonra KDS'yi başlatın:

```powershell
cd C:\Users\ardag\source\repos\RestaurantApp\kitchen-kds
.\start-expo.cmd
```

Terminalde `w` tuşuna basınca bilgisayarda açılır. Varsayılan API adresi `http://localhost:5223`'tür.
