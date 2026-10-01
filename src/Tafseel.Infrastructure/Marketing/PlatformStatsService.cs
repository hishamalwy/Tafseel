using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Authorization;
using Tafseel.Application.Marketing;
using Tafseel.Domain.LiveSessions;
using Tafseel.Infrastructure.Marketplace;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Marketing;

/// <summary>
/// Public counters for the landing page. The teacher count reuses the canonical
/// Browse eligibility query so the headline number matches what a visitor can
/// actually find on the Browse page.
/// </summary>
internal sealed class PlatformStatsService(TafseelDbContext db) : IPlatformStatsService
{
    public async Task<PlatformStatsDto> GetAsync(CancellationToken ct)
    {
        var students = await StudentsAsync(ct);
        var teachers = await TeacherPublicQueries.BrowsableTeachers(db).CountAsync(ct);
        var subjects = await db.Subjects.AsNoTracking().CountAsync(x => x.IsActive, ct);
        var completedSessions = await db.LiveSessionBookings.AsNoTracking()
            .CountAsync(x => x.Status == LiveSessionStatus.Completed, ct);
        return new PlatformStatsDto(students, teachers, subjects, completedSessions);
    }

    private async Task<int> StudentsAsync(CancellationToken ct)
    {
        var roleId = await db.Roles.AsNoTracking()
            .Where(x => x.Name == Roles.Student).Select(x => x.Id).SingleOrDefaultAsync(ct);
        if (roleId is null) return 0;
        return await db.UserRoles.AsNoTracking()
            .Join(db.Users.AsNoTracking(), x => x.UserId, x => x.Id, (membership, user) => new { membership, user })
            .CountAsync(x => x.membership.RoleId == roleId && x.user.EmailConfirmed && !x.user.IsSuspended, ct);
    }
}
