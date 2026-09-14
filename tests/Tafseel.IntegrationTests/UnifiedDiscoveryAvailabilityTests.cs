using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class UnifiedDiscoveryAvailabilityTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Exact_math_live_thursday_includes_only_matching_teacher_service_slots()
    {
        var previous = factory.Clock.GetUtcNow();
        factory.Clock.SetUtcNow(new DateTimeOffset(2026, 8, 6, 8, 0, 0, TimeSpan.Zero));
        try
        {
            var data = await SeedAsync();
            var client = factory.CreateClient();
            var page = await SearchAsync(client, data.MathId, data.LiveId, "2026-08-06");

            Assert.Equal(2, page.TotalCount);
            Assert.Contains(page.Items, x => x.TeacherId == data.ExactId);
            Assert.Contains(page.Items, x => x.TeacherId == data.SecondExactId);
            Assert.DoesNotContain(page.Items, x => x.TeacherId == data.OtherDayId);
            Assert.DoesNotContain(page.Items, x => x.TeacherId == data.AsyncOnlyId);
            Assert.DoesNotContain(page.Items, x => x.TeacherId == data.WrongServiceId);
            Assert.DoesNotContain(page.Items, x => x.TeacherId == data.PastSlotId);

            var empty = await SearchAsync(client, data.MathId, data.LiveId, "2026-08-08");
            Assert.Equal(0, empty.TotalCount);
            Assert.Empty(empty.Items);

            var paged = JsonDocument.Parse(await client.GetStringAsync(
                $"/api/v1/teachers?subjectId={data.MathId}&serviceTypeId={data.LiveId}"
                + "&availableOn=2026-08-06&viewerTimeZoneId=UTC&page=1&pageSize=1&sort=name")).RootElement;
            Assert.Equal(2, paged.GetProperty("totalCount").GetInt32());
            Assert.Equal(1, paged.GetProperty("items").GetArrayLength());
        }
        finally
        {
            factory.Clock.SetUtcNow(previous);
        }
    }

    [Fact]
    public async Task Teacher_name_keyword_works_and_thursday_filter_is_not_silently_relaxed()
    {
        var previous = factory.Clock.GetUtcNow();
        factory.Clock.SetUtcNow(new DateTimeOffset(2026, 8, 6, 8, 0, 0, TimeSpan.Zero));
        try
        {
            var data = await SeedAsync();
            await using (var scope = factory.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
                var user = await db.Users.SingleAsync(x => x.Id == data.OtherDayId);
                user.FullName = "Hisham";
                user.FullNameEnglish = "Hisham";
                await db.SaveChangesAsync();
            }

            var client = factory.CreateClient();
            var named = JsonDocument.Parse(await client.GetStringAsync(
                "/api/v1/teachers?search=Hisham&pageSize=12&sort=name")).RootElement;
            Assert.Contains(named.GetProperty("items").EnumerateArray(),
                item => item.GetProperty("teacherId").GetString() == data.OtherDayId);

            var constrained = await SearchAsync(client, data.MathId, data.LiveId, "2026-08-06");
            Assert.DoesNotContain(constrained.Items, x => x.TeacherId == data.OtherDayId);
            Assert.Equal(2, constrained.TotalCount);
        }
        finally
        {
            factory.Clock.SetUtcNow(previous);
        }
    }

    [Fact]
    public async Task Available_on_without_viewer_time_zone_is_rejected()
    {
        var response = await factory.CreateClient().GetAsync(
            "/api/v1/teachers?availableOn=2026-08-06&pageSize=9&sort=name");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private async Task<SeedData> SeedAsync()
    {
        var exact = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var secondExact = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var otherDay = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var asyncOnly = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var wrongService = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var pastSlot = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var live = await db.ServiceCatalogItems.AsTracking().SingleAsync(x => x.Code == "live_session");
        var asyncType = await db.ServiceCatalogItems.AsTracking()
            .FirstAsync(x => x.IsActive && !x.RequiresScheduling);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var math = new Subject("Mathematics " + suffix, "math", "الرياضيات " + suffix);
        var physics = new Subject("Physics " + suffix, "phys", "الفيزياء " + suffix);
        db.AddRange(math, physics);

        TeacherService AddTeacher(string teacherId, Subject subject, ServiceCatalogItem type, bool publish = true)
        {
            var profile = new TeacherProfile(teacherId, factory.Clock.GetUtcNow());
            profile.Update("Unified discovery teacher", "Published teacher used for exact-service availability.",
                "Egypt", "Cairo", "UTC", 10, factory.Clock.GetUtcNow());
            if (publish) profile.Publish(TeacherProfileReadiness.Ready, factory.Clock.GetUtcNow());
            var service = new TeacherService(
                teacherId, subject.Id, type.Id, "Discovery service", "Exact service availability fixture.",
                120, "SAR", 24, 0, factory.Clock.GetUtcNow());
            db.AddRange(profile, service, new TeacherSubjectQualification(teacherId, subject.Id, factory.Clock.GetUtcNow()));
            return service;
        }

        AddTeacher(exact.Id, math, live);
        AddTeacher(secondExact.Id, math, live);
        AddTeacher(otherDay.Id, math, live);
        AddTeacher(asyncOnly.Id, math, asyncType);
        AddTeacher(wrongService.Id, math, asyncType);
        db.AddRange(
            new TeacherService(
                wrongService.Id, physics.Id, live.Id, "Physics live", "Wrong-service live offer.",
                120, "SAR", 24, 0, factory.Clock.GetUtcNow()),
            new TeacherSubjectQualification(wrongService.Id, physics.Id, factory.Clock.GetUtcNow()));
        AddTeacher(pastSlot.Id, math, live);

        db.AddRange(
            Rule(exact.Id, DayOfWeek.Thursday, 10, 14),
            Rule(secondExact.Id, DayOfWeek.Thursday, 11, 15),
            Rule(otherDay.Id, DayOfWeek.Friday, 10, 14),
            Rule(asyncOnly.Id, DayOfWeek.Thursday, 10, 14),
            Rule(wrongService.Id, DayOfWeek.Thursday, 10, 14),
            Rule(pastSlot.Id, DayOfWeek.Thursday, 6, 7));
        await db.SaveChangesAsync();
        return new(exact.Id, secondExact.Id, otherDay.Id, asyncOnly.Id, wrongService.Id, pastSlot.Id, math.Id, live.Id);
    }

    private static TeacherAvailabilityRule Rule(string teacherId, DayOfWeek day, int startHour, int endHour) =>
        new(teacherId, day, new TimeOnly(startHour, 0), new TimeOnly(endHour, 0), "UTC", 30);

    private static async Task<TeacherPage> SearchAsync(
        HttpClient client, Guid subjectId, Guid liveId, string availableOn) =>
        (await client.GetFromJsonAsync<TeacherPage>(
            $"/api/v1/teachers?subjectId={subjectId}&serviceTypeId={liveId}"
            + $"&availableOn={availableOn}&viewerTimeZoneId=UTC&pageSize=12&sort=name"))!;

    private sealed record SeedData(
        string ExactId, string SecondExactId, string OtherDayId, string AsyncOnlyId, string WrongServiceId,
        string PastSlotId, Guid MathId, Guid LiveId);

    private sealed record TeacherItem(string TeacherId);
    private sealed record TeacherPage(IReadOnlyCollection<TeacherItem> Items, int TotalCount);
}
