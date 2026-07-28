using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using RestaurantApp.Contracts;
using RestaurantApp.Models;

namespace RestaurantApp.Infrastructure;

public record DailyReportOrderRow(
    int Id,
    int TableNumber,
    OrderStatus Status,
    decimal TotalAmount,
    DateTime CreatedAt,
    string? CancellationReason);

public static class DailyReportPdfExporter
{
    private static readonly CultureInfo TurkishCulture = CultureInfo.GetCultureInfo("tr-TR");

    public static byte[] Create(DailyReportDto report, IReadOnlyCollection<DailyReportOrderRow> orders)
    {
        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(32);
                page.DefaultTextStyle(style => style.FontSize(9));

                page.Header()
                    .Background(Colors.Green.Darken3)
                    .Padding(18)
                    .Row(row =>
                    {
                        row.RelativeItem().Column(column =>
                        {
                            column.Item().Text("RESTORAN YÖNETİMİ").FontSize(19).Bold().FontColor(Colors.White);
                            column.Item().Text("Günlük satış ve sipariş raporu").FontSize(10).FontColor(Colors.Green.Lighten4);
                        });

                        row.ConstantItem(150).AlignRight().Column(column =>
                        {
                            column.Item().AlignRight().Text(report.Date.ToString("dd.MM.yyyy", TurkishCulture)).FontSize(15).Bold().FontColor(Colors.White);
                            column.Item().AlignRight().Text($"Oluşturma: {DateTime.Now:dd.MM.yyyy HH:mm}").FontSize(8).FontColor(Colors.Green.Lighten4);
                        });
                    });

                page.Content().PaddingVertical(18).Column(column =>
                {
                    column.Spacing(12);

                    column.Item().Row(row =>
                    {
                        row.Spacing(8);
                        AddMetric(row, "CİRO", $"{report.TotalRevenue.ToString("N2", TurkishCulture)} TL");
                        AddMetric(row, "SİPARİŞ", report.TotalOrders.ToString(TurkishCulture));
                        AddMetric(row, "EN ÇOK SATAN", report.MostSoldItemName ?? "-");
                    });

                    column.Item().Element(SectionTitle).Text("Sipariş özeti").Bold().FontSize(12);
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn();
                            columns.RelativeColumn();
                            columns.RelativeColumn();
                        });

                        AddSummaryCell(table, "Toplam", report.TotalOrders.ToString(TurkishCulture));
                        AddSummaryCell(table, "Tamamlanan", report.CompletedOrders.ToString(TurkishCulture));
                        AddSummaryCell(table, "İptal edilen", report.CancelledOrders.ToString(TurkishCulture));
                    });

                    column.Item().Element(SectionTitle).Text("Ödeme yöntemleri").Bold().FontSize(12);
                    if (report.PaymentMethods.Count == 0)
                    {
                        column.Item().Element(EmptyState).Text("Bu tarihte tamamlanmış ödeme bulunmuyor.");
                    }
                    else
                    {
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.RelativeColumn();
                                columns.ConstantColumn(110);
                            });

                            table.Header(header =>
                            {
                                header.Cell().Element(HeaderCell).Text("Yöntem").Bold();
                                header.Cell().Element(HeaderCell).AlignRight().Text("Tutar").Bold();
                            });

                            foreach (var payment in report.PaymentMethods.OrderByDescending(item => item.Total))
                            {
                                table.Cell().Element(BodyCell).Text(GetPaymentMethodText(payment.Method));
                                table.Cell().Element(BodyCell).AlignRight().Text($"{payment.Total.ToString("N2", TurkishCulture)} TL");
                            }
                        });
                    }

                    column.Item().Element(SectionTitle).Text("Son 10 sipariş").Bold().FontSize(12);
                    if (orders.Count == 0)
                    {
                        column.Item().Element(EmptyState).Text("Bu tarihte tamamlanan veya iptal edilen sipariş bulunmuyor.");
                    }
                    else
                    {
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.ConstantColumn(48);
                                columns.ConstantColumn(52);
                                columns.ConstantColumn(72);
                                columns.RelativeColumn();
                                columns.ConstantColumn(82);
                            });

                            table.Header(header =>
                            {
                                header.Cell().Element(HeaderCell).Text("No").Bold();
                                header.Cell().Element(HeaderCell).Text("Masa").Bold();
                                header.Cell().Element(HeaderCell).Text("Saat").Bold();
                                header.Cell().Element(HeaderCell).Text("Durum").Bold();
                                header.Cell().Element(HeaderCell).AlignRight().Text("Tutar").Bold();
                            });

                            foreach (var order in orders)
                            {
                                table.Cell().Element(BodyCell).Text($"#{order.Id}");
                                table.Cell().Element(BodyCell).Text(order.TableNumber.ToString(TurkishCulture));
                                table.Cell().Element(BodyCell).Text(ToLocalTime(order.CreatedAt).ToString("HH:mm", TurkishCulture));
                                table.Cell().Element(BodyCell).Text(GetOrderStatusText(order));
                                table.Cell().Element(BodyCell).AlignRight().Text($"{order.TotalAmount.ToString("N2", TurkishCulture)} TL");
                            }
                        });
                    }
                });

                page.Footer()
                    .BorderTop(1)
                    .BorderColor(Colors.Grey.Lighten2)
                    .PaddingTop(8)
                    .DefaultTextStyle(style => style.FontSize(8).FontColor(Colors.Grey.Darken1))
                    .Row(row =>
                    {
                        row.RelativeItem().Text("Restoran Otomasyon - Yönetim raporu");
                        row.RelativeItem().AlignRight().Text(text =>
                        {
                            text.Span("Sayfa ");
                            text.CurrentPageNumber();
                            text.Span(" / ");
                            text.TotalPages();
                        });
                    });
            });
        }).GeneratePdf();
    }

    private static void AddMetric(RowDescriptor row, string label, string value)
    {
        row.RelativeItem().Element(MetricCard).Column(column =>
        {
            column.Item().Text(label).FontSize(8).Bold().FontColor(Colors.Grey.Darken1);
            column.Item().PaddingTop(4).Text(value).FontSize(14).Bold().FontColor(Colors.Green.Darken3);
        });
    }

    private static void AddSummaryCell(TableDescriptor table, string label, string value)
    {
        table.Cell().Element(SummaryCell).Column(column =>
        {
            column.Item().Text(label).FontSize(8).FontColor(Colors.Grey.Darken1);
            column.Item().PaddingTop(2).Text(value).FontSize(13).Bold();
        });
    }

    private static IContainer MetricCard(IContainer container) =>
        container.Border(1).BorderColor(Colors.Grey.Lighten2).Background(Colors.Grey.Lighten5).Padding(12);

    private static IContainer SummaryCell(IContainer container) =>
        container.Border(1).BorderColor(Colors.Grey.Lighten2).Padding(10);

    private static IContainer SectionTitle(IContainer container) =>
        container.PaddingTop(4).PaddingBottom(2);

    private static IContainer HeaderCell(IContainer container) =>
        container.Background(Colors.Green.Lighten5).BorderBottom(1).BorderColor(Colors.Green.Lighten3).Padding(7);

    private static IContainer BodyCell(IContainer container) =>
        container.BorderBottom(1).BorderColor(Colors.Grey.Lighten2).PaddingVertical(7).PaddingHorizontal(5);

    private static IContainer EmptyState(IContainer container) =>
        container.Border(1).BorderColor(Colors.Grey.Lighten2).Background(Colors.Grey.Lighten5).Padding(12);

    private static string GetPaymentMethodText(PaymentMethod method) => method switch
    {
        PaymentMethod.Cash => "Nakit",
        PaymentMethod.CreditCard => "Kredi kartı",
        PaymentMethod.QrPayment => "QR ödeme",
        _ => method.ToString()
    };

    private static string GetOrderStatusText(DailyReportOrderRow order) => order.Status switch
    {
        OrderStatus.Delivered => "Tamamlandı",
        OrderStatus.Cancelled when !string.IsNullOrWhiteSpace(order.CancellationReason) => $"İptal - {order.CancellationReason}",
        OrderStatus.Cancelled => "İptal",
        OrderStatus.Ready => "Hazır",
        OrderStatus.Preparing => "Hazırlanıyor",
        _ => "Yeni"
    };

    private static DateTime ToLocalTime(DateTime value) => RestaurantTime.ToLocal(value);
}
