using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using RestaurantApp.Contracts;

namespace RestaurantApp.Infrastructure;

public static class SalesAnalysisPdfExporter
{
    private static readonly CultureInfo TurkishCulture = CultureInfo.GetCultureInfo("tr-TR");

    public static byte[] Create(
        RevenueReportDto report,
        IReadOnlyCollection<TopSellingItemDto> topItems,
        IReadOnlyCollection<TopSellingItemDto> bottomItems,
        SalesSummaryReportDto summaries,
        int completedOrderCount)
    {
        var dayCount = report.EndDate.DayNumber - report.StartDate.DayNumber + 1;
        var averageDailyRevenue = dayCount == 0 ? 0 : report.TotalRevenue / dayCount;
        var bestDay = report.DailyRevenue.OrderByDescending(item => item.Revenue).FirstOrDefault();
        var chartDays = report.DailyRevenue.TakeLast(14).ToList();
        var maximumDailyRevenue = Math.Max(chartDays.Max(item => (decimal?)item.Revenue) ?? 0, 1);

        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(28);
                page.DefaultTextStyle(style => style.FontFamily("Arial").FontSize(9).FontColor(Colors.Grey.Darken3));

                page.Header()
                    .Background(Colors.BlueGrey.Darken4)
                    .Padding(18)
                    .Row(row =>
                    {
                        row.RelativeItem().Column(column =>
                        {
                            column.Item().Text("RESTORAN OTOMASYON").FontSize(8).Bold().FontColor(Colors.Teal.Lighten2);
                            column.Item().PaddingTop(3).Text("Satış Analizi").FontSize(21).Bold().FontColor(Colors.White);
                        });

                        row.ConstantItem(190).AlignRight().Column(column =>
                        {
                            column.Item().AlignRight().Text($"{report.StartDate:dd.MM.yyyy} - {report.EndDate:dd.MM.yyyy}").FontSize(12).Bold().FontColor(Colors.White);
                            column.Item().AlignRight().Text($"Rapor: {DateTime.Now:dd.MM.yyyy HH:mm}").FontSize(8).FontColor(Colors.BlueGrey.Lighten3);
                        });
                    });

                page.Content().PaddingVertical(14).Column(column =>
                {
                    column.Spacing(9);

                    column.Item().Row(row =>
                    {
                        row.Spacing(8);
                        AddMetric(row, "TOPLAM CİRO", FormatMoney(report.TotalRevenue));
                        AddMetric(row, "TAMAMLANAN SİPARİŞ", completedOrderCount.ToString(TurkishCulture));
                        AddMetric(row, "GÜNLÜK ORTALAMA", FormatMoney(averageDailyRevenue));
                    });

                    column.Item().Element(HighlightCard).Row(row =>
                    {
                        row.RelativeItem().Column(content =>
                        {
                            content.Item().Text("EN YÜKSEK CİRO GÜNÜ").FontSize(8).Bold().FontColor(Colors.BlueGrey.Darken1);
                            content.Item().PaddingTop(3).Text(bestDay is null ? "-" : bestDay.Date.ToString("dd MMMM yyyy", TurkishCulture)).FontSize(13).Bold();
                        });
                        row.ConstantItem(130).AlignRight().Text(bestDay is null ? "0,00 TL" : FormatMoney(bestDay.Revenue)).FontSize(15).Bold().FontColor(Colors.Teal.Darken2);
                    });

                    column.Item().Element(SectionTitle).Text(
                        report.DailyRevenue.Count > chartDays.Count
                            ? "Günlük ciro grafiği - son 14 gün"
                            : "Günlük ciro grafiği").Bold().FontSize(12);
                    column.Item().Height(110).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(8).Row(row =>
                    {
                        row.Spacing(3);
                        foreach (var day in chartDays)
                        {
                            var height = day.Revenue <= 0
                                ? 2f
                                : Math.Max(4f, (float)(day.Revenue / maximumDailyRevenue * 73));

                            row.RelativeItem().Column(barColumn =>
                            {
                                barColumn.Item().Height(79).AlignBottom().Element(container =>
                                    container.Height(height).Background(Colors.Teal.Medium));
                                barColumn.Item().PaddingTop(4).AlignCenter().Text(day.Date.ToString("dd.MM", TurkishCulture)).FontSize(6);
                            });
                        }
                    });

                    column.Item().Element(SectionTitle).Text("En çok satan 5 ürün").Bold().FontSize(12);
                    if (topItems.Count == 0)
                    {
                        column.Item().Element(EmptyState).Text("Seçili tarih aralığında tamamlanan ürün satışı bulunmuyor.");
                    }
                    else
                    {
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.ConstantColumn(35);
                                columns.RelativeColumn();
                                columns.ConstantColumn(70);
                                columns.ConstantColumn(100);
                            });

                            table.Header(header =>
                            {
                                header.Cell().Element(HeaderCell).Text("Sıra").Bold();
                                header.Cell().Element(HeaderCell).Text("Ürün").Bold();
                                header.Cell().Element(HeaderCell).AlignRight().Text("Adet").Bold();
                                header.Cell().Element(HeaderCell).AlignRight().Text("Tutar").Bold();
                            });

                            var rank = 1;
                            foreach (var item in topItems)
                            {
                                table.Cell().Element(BodyCell).Text(rank++.ToString(TurkishCulture));
                                table.Cell().Element(BodyCell).Text(item.Name);
                                table.Cell().Element(BodyCell).AlignRight().Text(item.Quantity.ToString(TurkishCulture));
                                table.Cell().Element(BodyCell).AlignRight().Text(FormatMoney(item.Revenue));
                            }
                        });
                    }

                    column.Item().Element(SectionTitle).Text("En az satan 5 ürün").Bold().FontSize(12);
                    if (bottomItems.Count == 0)
                    {
                        column.Item().Element(EmptyState).Text("Raporlanabilecek menü ürünü bulunmuyor.");
                    }
                    else
                    {
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.ConstantColumn(35);
                                columns.RelativeColumn();
                                columns.ConstantColumn(70);
                                columns.ConstantColumn(100);
                            });

                            table.Header(header =>
                            {
                                header.Cell().Element(HeaderCell).Text("Sıra").Bold();
                                header.Cell().Element(HeaderCell).Text("Ürün").Bold();
                                header.Cell().Element(HeaderCell).AlignRight().Text("Adet").Bold();
                                header.Cell().Element(HeaderCell).AlignRight().Text("Tutar").Bold();
                            });

                            var rank = 1;
                            foreach (var item in bottomItems)
                            {
                                table.Cell().Element(BodyCell).Text(rank++.ToString(TurkishCulture));
                                table.Cell().Element(BodyCell).Text(item.Name);
                                table.Cell().Element(BodyCell).AlignRight().Text(item.Quantity.ToString(TurkishCulture));
                                table.Cell().Element(BodyCell).AlignRight().Text(FormatMoney(item.Revenue));
                            }
                        });
                    }

                    column.Item().Element(SectionTitle).Text("Günlük özet").Bold().FontSize(12);
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn();
                            columns.ConstantColumn(55);
                            columns.ConstantColumn(60);
                            columns.ConstantColumn(50);
                            columns.ConstantColumn(90);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Element(HeaderCell).Text("Tarih").Bold();
                            header.Cell().Element(HeaderCell).AlignRight().Text("Sipariş").Bold();
                            header.Cell().Element(HeaderCell).AlignRight().Text("Tamam").Bold();
                            header.Cell().Element(HeaderCell).AlignRight().Text("İptal").Bold();
                            header.Cell().Element(HeaderCell).AlignRight().Text("Ciro").Bold();
                        });

                        foreach (var day in summaries.Daily)
                        {
                            table.Cell().Element(BodyCell).Text(day.StartDate.ToString("dd MMMM yyyy", TurkishCulture));
                            table.Cell().Element(BodyCell).AlignRight().Text(day.TotalOrders.ToString(TurkishCulture));
                            table.Cell().Element(BodyCell).AlignRight().Text(day.CompletedOrders.ToString(TurkishCulture));
                            table.Cell().Element(BodyCell).AlignRight().Text(day.CancelledOrders.ToString(TurkishCulture));
                            table.Cell().Element(BodyCell).AlignRight().Text(FormatMoney(day.TotalRevenue));
                        }
                    });

                    column.Item().Element(SectionTitle).Text("Haftalık özet").Bold().FontSize(12);
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn();
                            columns.ConstantColumn(55);
                            columns.ConstantColumn(60);
                            columns.ConstantColumn(50);
                            columns.ConstantColumn(90);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Element(HeaderCell).Text("Dönem").Bold();
                            header.Cell().Element(HeaderCell).AlignRight().Text("Sipariş").Bold();
                            header.Cell().Element(HeaderCell).AlignRight().Text("Tamam").Bold();
                            header.Cell().Element(HeaderCell).AlignRight().Text("İptal").Bold();
                            header.Cell().Element(HeaderCell).AlignRight().Text("Ciro").Bold();
                        });

                        foreach (var week in summaries.Weekly)
                        {
                            table.Cell().Element(BodyCell).Text($"{week.StartDate:dd.MM.yyyy} - {week.EndDate:dd.MM.yyyy}");
                            table.Cell().Element(BodyCell).AlignRight().Text(week.TotalOrders.ToString(TurkishCulture));
                            table.Cell().Element(BodyCell).AlignRight().Text(week.CompletedOrders.ToString(TurkishCulture));
                            table.Cell().Element(BodyCell).AlignRight().Text(week.CancelledOrders.ToString(TurkishCulture));
                            table.Cell().Element(BodyCell).AlignRight().Text(FormatMoney(week.TotalRevenue));
                        }
                    });
                });

                page.Footer()
                    .BorderTop(1)
                    .BorderColor(Colors.Grey.Lighten2)
                    .PaddingTop(8)
                    .DefaultTextStyle(style => style.FontSize(8).FontColor(Colors.Grey.Darken1))
                    .Row(row =>
                    {
                        row.RelativeItem().Text("Restoran Otomasyon - Satış analizi");
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
            column.Item().PaddingTop(4).Text(value).FontSize(14).Bold().FontColor(Colors.Teal.Darken2);
        });
    }

    private static string FormatMoney(decimal value) => $"{value.ToString("N2", TurkishCulture)} TL";

    private static IContainer MetricCard(IContainer container) =>
        container.Border(1).BorderColor(Colors.Grey.Lighten2).Background(Colors.Grey.Lighten5).Padding(9);

    private static IContainer HighlightCard(IContainer container) =>
        container.Border(1).BorderColor(Colors.Teal.Lighten3).Background(Colors.Teal.Lighten5).Padding(9);

    private static IContainer SectionTitle(IContainer container) =>
        container.PaddingTop(4).PaddingBottom(2);

    private static IContainer HeaderCell(IContainer container) =>
        container.Background(Colors.BlueGrey.Lighten5).BorderBottom(1).BorderColor(Colors.BlueGrey.Lighten3).Padding(5);

    private static IContainer BodyCell(IContainer container) =>
        container.BorderBottom(1).BorderColor(Colors.Grey.Lighten2).PaddingVertical(4).PaddingHorizontal(5);

    private static IContainer EmptyState(IContainer container) =>
        container.Border(1).BorderColor(Colors.Grey.Lighten2).Background(Colors.Grey.Lighten5).Padding(12);
}
