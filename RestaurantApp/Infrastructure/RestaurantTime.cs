namespace RestaurantApp.Infrastructure;

public static class RestaurantTime
{
    private static readonly TimeZoneInfo TimeZone = FindTimeZone();

    public static DateOnly Today() => ToDate(DateTime.UtcNow);

    public static DateOnly ToDate(DateTime utcDateTime)
    {
        var normalizedUtc = DateTime.SpecifyKind(utcDateTime, DateTimeKind.Utc);
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(normalizedUtc, TimeZone));
    }

    public static DateTime ToLocal(DateTime utcDateTime)
    {
        var normalizedUtc = DateTime.SpecifyKind(utcDateTime, DateTimeKind.Utc);
        return TimeZoneInfo.ConvertTimeFromUtc(normalizedUtc, TimeZone);
    }

    public static (DateTime Start, DateTime End) ToUtcRange(DateOnly startDate, DateOnly endDate)
    {
        var start = startDate == DateOnly.MinValue
            ? DateTime.SpecifyKind(DateTime.MinValue, DateTimeKind.Utc)
            : TimeZoneInfo.ConvertTimeToUtc(
                DateTime.SpecifyKind(startDate.ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified),
                TimeZone);
        var end = endDate == DateOnly.MaxValue
            ? DateTime.SpecifyKind(DateTime.MaxValue, DateTimeKind.Utc)
            : TimeZoneInfo.ConvertTimeToUtc(
                DateTime.SpecifyKind(endDate.AddDays(1).ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified),
                TimeZone);

        return (start, end);
    }

    private static TimeZoneInfo FindTimeZone()
    {
        foreach (var timeZoneId in new[] { "Europe/Istanbul", "Turkey Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            }
            catch (TimeZoneNotFoundException)
            {
                // Try the next platform-specific identifier.
            }
            catch (InvalidTimeZoneException)
            {
                // Try the next platform-specific identifier.
            }
        }

        return TimeZoneInfo.Local;
    }
}
