using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tafseel.Application.Authorization;
using Tafseel.Application.Students;

namespace Tafseel.Api.Controllers;

[ApiController, Route("api/v1/students/me")]
[Authorize(Roles = Roles.Student)]
public sealed class StudentLearningPreferencesController(
    IStudentLearningPreferenceService preferences) : ControllerBase
{
    [HttpGet("learning-preferences")]
    public Task<StudentLearningPreferenceDto> Get(CancellationToken ct) =>
        preferences.GetAsync(UserId(), ct);

    [HttpPut("learning-preferences")]
    public Task<StudentLearningPreferenceDto> Put(
        UpdateStudentLearningPreference input, CancellationToken ct) =>
        preferences.UpsertAsync(UserId(), input, ct);

    private string UserId() =>
        User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}
