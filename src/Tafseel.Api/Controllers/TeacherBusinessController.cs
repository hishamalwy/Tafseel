using System.Globalization;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tafseel.Application.Authorization;
using Tafseel.Application.TeacherBusiness;

namespace Tafseel.Api.Controllers;

[ApiController, Route("api/v1/teachers/me/business"), Authorize(Policy = Permissions.TeachersManageOwnProfile)]
public sealed class TeacherBusinessController(ITeacherBusinessService business) : ControllerBase
{
    [HttpGet("home-summary")]
    public Task<TeacherHomeSummaryDto> HomeSummary(CancellationToken ct) => business.GetHomeSummaryAsync(UserId(), ct);
    [HttpGet("analytics")]
    public Task<TeacherBusinessAnalyticsDto> Analytics(CancellationToken ct) => business.GetAnalyticsAsync(UserId(), ct);
    [HttpGet("calendar.ics")]
    public async Task<IActionResult> Calendar(CancellationToken ct) => File(Encoding.UTF8.GetBytes(await business.GetCalendarAsync(UserId(), ct)), "text/calendar; charset=utf-8", "tafseel-calendar.ics");
    [HttpGet("statement.csv")]
    public async Task<IActionResult> Statement(DateTimeOffset? from, DateTimeOffset? to, CancellationToken ct)
    {
        var rows = await business.GetStatementAsync(UserId(), from, to, ct);
        static string Csv(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
        var csv = new StringBuilder("Type,Reference,Date,Description,Gross,Fees,Net,Currency,Status\r\n");
        foreach (var x in rows) csv.Append(Csv(x.Type)).Append(',').Append(x.ReferenceId).Append(',').Append(x.Date.ToString("O"))
            .Append(',').Append(Csv(x.Description)).Append(',').Append(x.Gross.ToString(CultureInfo.InvariantCulture)).Append(',').Append(x.Fees.ToString(CultureInfo.InvariantCulture))
            .Append(',').Append(x.Net.ToString(CultureInfo.InvariantCulture)).Append(',').Append(x.Currency).Append(',').Append(Csv(x.Status)).Append("\r\n");
        return File(new UTF8Encoding(true).GetBytes(csv.ToString()), "text/csv; charset=utf-8", "tafseel-earnings.csv");
    }
    private string UserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
