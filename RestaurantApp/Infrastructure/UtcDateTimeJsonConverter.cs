using System.Text.Json;
using System.Text.Json.Serialization;

namespace RestaurantApp.Infrastructure;

// SQL Server DateTime alanlarinin Kind bilgisi okunurken kaybolur. Uygulamadaki
// Sipariş zamanları UTC tutulduğu için istemciye de açık UTC (Z) olarak gönderilir.
public sealed class UtcDateTimeJsonConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return DateTime.SpecifyKind(reader.GetDateTime(), DateTimeKind.Utc);
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }
}
