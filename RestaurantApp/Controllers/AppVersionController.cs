using Microsoft.AspNetCore.Mvc;
using RestaurantApp.Contracts;

namespace RestaurantApp.Controllers;

[ApiController]
[Route("api/app-version")]
public class AppVersionController : ControllerBase
{
    private readonly IConfiguration _configuration;

    public AppVersionController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    [HttpGet("android")]
    public ActionResult<AppVersionDto> GetAndroid()
    {
        var section = _configuration.GetSection("AppVersion:Android");
        return Ok(new AppVersionDto(
            section["Version"] ?? "1.0.8",
            section.GetValue("VersionCode", 9),
            section["DownloadUrl"] ?? string.Empty,
            section.GetValue("IsRequired", false)));
    }
}
