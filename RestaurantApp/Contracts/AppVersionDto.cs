namespace RestaurantApp.Contracts;

public record AppVersionDto(
    string Version,
    int VersionCode,
    string DownloadUrl,
    bool IsRequired);
