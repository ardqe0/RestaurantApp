# Geliştirme Notları

Bu dosya, projeye küçük eforla belirgin fayda sağlayan iyileştirmeleri takip eder.

## Tamamlanan iyileştirmeler

- [x] API ve veritabanı için ayrı sağlık kontrolü uçları eklendi.
  - `/health/live`: Uygulama işleminin çalıştığını gösterir.
  - `/health/ready`: Uygulamanın veritabanına erişebildiğini gösterir.
- [x] Müşteri, mutfak ve admin isteklerine 15 saniyelik zaman aşımı eklendi.
- [x] Bağlantı, yetki, hız sınırı ve sunucu hataları kullanıcı dostu mesajlara dönüştürüldü.
- [x] Geçici ağ hatasında mobil erişim belirtecinin silinmesi engellendi.
- [x] CI; backend, admin, müşteri ve mutfak projelerini ayrı ayrı kontrol edecek şekilde genişletildi.
- [x] CI'a yüksek önem seviyeli paket güvenlik denetimi eklendi.
- [x] Admin panelindeki yüksek önem seviyeli Vite güvenlik açığı, Vite 6.4.3'e yükseltilerek kapatıldı.
- [x] Yerel geliştirme ve CI için pnpm sürümü 11.9.0'a sabitlendi.

## Sonraki küçük iyileştirme adayları

- [ ] Admin panelinde sağlık kontrolü sonucunu küçük bir “Sistem durumu” kartında göster.
- [ ] API hatalarında gösterilen istek kimliğini destek ekranından kopyalanabilir yap.
- [ ] Yavaş sorgular için yapılandırılabilir performans günlüğü ekle.
- [ ] Kritik kullanıcı akışları için Playwright tabanlı tarayıcı testi ekle.
- [ ] Veritabanı yedekleme ve geri yükleme adımlarını yönetim dokümanına ekle.
