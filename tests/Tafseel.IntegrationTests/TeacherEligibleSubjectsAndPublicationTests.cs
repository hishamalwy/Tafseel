using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class TeacherEligibleSubjectsAndPublicationTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Eligible_subjects_include_only_active_approved_qualifications()
    {
        var seeded = await SeedAsync(withApproved: true, withOtherSubject: true, revokeOther: true);
        var client = await ClientForAsync(seeded.Email);

        var eligible = JsonDocument.Parse(
            await client.GetStringAsync("/api/v1/teachers/me/eligible-subjects")).RootElement;
        var ids = eligible.EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).ToArray();
        Assert.Contains(seeded.SubjectId, ids);
        Assert.DoesNotContain(seeded.OtherSubjectId, ids);

        var createOk = await client.PostAsJsonAsync("/api/v1/teachers/me/services", Service(seeded, seeded.SubjectId));
        Assert.Equal(HttpStatusCode.Created, createOk.StatusCode);

        var createBad = await client.PostAsJsonAsync("/api/v1/teachers/me/services", Service(seeded, seeded.OtherSubjectId));
        Assert.Equal(HttpStatusCode.BadRequest, createBad.StatusCode);
        Assert.Equal("teacher_not_approved", await CodeAsync(createBad));
    }

    [Fact]
    public async Task Unqualified_subject_is_rejected_and_never_listed_as_eligible()
    {
        var seeded = await SeedAsync(withApproved: true, withOtherSubject: true);
        var client = await ClientForAsync(seeded.Email);
        var eligible = JsonDocument.Parse(
            await client.GetStringAsync("/api/v1/teachers/me/eligible-subjects")).RootElement;
        Assert.DoesNotContain(eligible.EnumerateArray(), x => x.GetProperty("id").GetGuid() == seeded.OtherSubjectId);

        var create = await client.PostAsJsonAsync("/api/v1/teachers/me/services", Service(seeded, seeded.OtherSubjectId));
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        Assert.Equal("teacher_not_approved", await CodeAsync(create));
    }

    [Fact]
    public async Task Revoked_qualification_deactivates_services_and_blocks_recreate()
    {
        var seeded = await SeedAsync(withApproved: true, withService: true);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var qualification = await db.TeacherSubjectQualifications
                .SingleAsync(x => x.TeacherId == seeded.Id && x.SubjectId == seeded.SubjectId);
            var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
            qualification.Revoke(reviewer.Id, "Evidence revoked for marketplace gate test.", DateTimeOffset.UtcNow);
            var service = await db.TeacherServices.SingleAsync(x => x.Id == seeded.ServiceId);
            service.SetActive(false, DateTimeOffset.UtcNow);
            await db.SaveChangesAsync();
        }

        var client = await ClientForAsync(seeded.Email);
        var eligible = JsonDocument.Parse(
            await client.GetStringAsync("/api/v1/teachers/me/eligible-subjects")).RootElement;
        Assert.Empty(eligible.EnumerateArray());

        var create = await client.PostAsJsonAsync("/api/v1/teachers/me/services", Service(seeded, seeded.SubjectId));
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        Assert.Equal("teacher_not_approved", await CodeAsync(create));
    }

    [Fact]
    public async Task Approved_teacher_without_publication_is_hidden_from_browse()
    {
        var seeded = await SeedAsync(withApproved: true, withService: true, publish: false);
        var anonymous = factory.CreateClient();
        var search = JsonDocument.Parse(await anonymous.GetStringAsync(
            $"/api/v1/teachers?subjectId={seeded.SubjectId}&pageSize=100")).RootElement;
        Assert.DoesNotContain(search.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("teacherId").GetString() == seeded.Id);

        var client = await ClientForAsync(seeded.Email);
        var onboarding = JsonDocument.Parse(
            await client.GetStringAsync("/api/v1/teachers/onboarding-status")).RootElement;
        Assert.Equal(10, onboarding.GetProperty("status").GetInt32()); // ApprovedButNotPublished
        Assert.Contains(onboarding.GetProperty("blockingReasons").EnumerateArray(),
            x => x.GetString() == "profile_not_published");
        Assert.Contains(onboarding.GetProperty("missingRequirements").EnumerateArray(),
            x => x.GetString() is "ready_for_publication" or "publish_profile");

        var publish = await client.PutAsJsonAsync("/api/v1/teachers/me/publication", new { published = true });
        publish.EnsureSuccessStatusCode();

        search = JsonDocument.Parse(await anonymous.GetStringAsync(
            $"/api/v1/teachers?subjectId={seeded.SubjectId}&pageSize=100")).RootElement;
        Assert.Contains(search.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("teacherId").GetString() == seeded.Id);
    }

    [Fact]
    public async Task Scheduling_service_without_availability_blocks_publish_with_specific_reason()
    {
        var seeded = await SeedAsync(withApproved: true, schedulingService: true, publish: false);
        var client = await ClientForAsync(seeded.Email);
        var publish = await client.PutAsJsonAsync("/api/v1/teachers/me/publication", new { published = true });
        Assert.Equal(HttpStatusCode.BadRequest, publish.StatusCode);
        Assert.Equal("active_service_required", await CodeAsync(publish));

        var onboarding = JsonDocument.Parse(
            await client.GetStringAsync("/api/v1/teachers/onboarding-status")).RootElement;
        Assert.Contains(onboarding.GetProperty("blockingReasons").EnumerateArray(),
            x => x.GetString() == "availability_required");
        Assert.Contains(onboarding.GetProperty("missingRequirements").EnumerateArray(),
            x => x.GetString() == "set_availability");

        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/teachers/me/availability/rules", new
        {
            dayOfWeek = DayOfWeek.Sunday,
            start = "17:00:00",
            end = "21:00:00",
            timeZoneId = "Egypt Standard Time",
            slotMinutes = 60
        })).StatusCode);

        publish = await client.PutAsJsonAsync("/api/v1/teachers/me/publication", new { published = true });
        publish.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Onboarding_keeps_dashboard_when_second_subject_draft_exists()
    {
        var seeded = await SeedAsync(withApproved: true, withService: true, publish: true);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var qualificationTopic = new QualificationTopic(
                seeded.OtherSubjectId,
                "Draft assignment " + Guid.NewGuid().ToString("N")[..8],
                "Record a short draft demo.",
                120);
            db.Add(qualificationTopic);
            db.Add(new TeacherApplication(seeded.Id, seeded.OtherSubjectId, qualificationTopic.Id, DateTimeOffset.UtcNow));
            await db.SaveChangesAsync();
        }

        var client = await ClientForAsync(seeded.Email);
        var onboarding = JsonDocument.Parse(
            await client.GetStringAsync("/api/v1/teachers/onboarding-status")).RootElement;
        Assert.True(onboarding.GetProperty("status").GetInt32() >= 9);
        Assert.Contains("Tafseel-Teacher-Dashboard", onboarding.GetProperty("nextUrl").GetString());
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private async Task<Seeded> SeedAsync(
        bool withApproved,
        bool withOtherSubject = false,
        bool revokeOther = false,
        bool withService = false,
        bool schedulingService = false,
        bool publish = true)
    {
        var user = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Subject " + suffix, "code");
        var otherSubject = new Subject("Other " + suffix, "code");
        var serviceType = schedulingService
            ? new ServiceCatalogItem(
                "Live " + suffix, "Live session", "live_" + suffix, "جلسة", "جلسة مباشرة",
                isPublic: true, teacherSelectable: true, requiresScheduling: true)
            : new ServiceCatalogItem(
                "Explanation " + suffix, "Custom explanation", "svc_" + suffix, "شرح", "شرح مخصص");
        db.AddRange(subject, otherSubject, serviceType);
        if (withApproved)
            db.Add(new TeacherSubjectQualification(user.Id, subject.Id, DateTimeOffset.UtcNow));
        if (revokeOther)
        {
            var otherQual = new TeacherSubjectQualification(user.Id, otherSubject.Id, DateTimeOffset.UtcNow);
            otherQual.Revoke("system", "Revoked other subject for eligibility test.", DateTimeOffset.UtcNow);
            db.Add(otherQual);
        }
        var profile = new TeacherProfile(user.Id, DateTimeOffset.UtcNow);
        profile.Update("Clear explanations", "Detailed professional teacher biography.", "Egypt", "Cairo",
            "Egypt Standard Time", 30, DateTimeOffset.UtcNow);
        if (withApproved && publish) profile.Publish(DateTimeOffset.UtcNow);
        db.Add(profile);
        TeacherService? service = null;
        if (withService || schedulingService)
        {
            service = new TeacherService(user.Id, subject.Id, serviceType.Id, "Service offer",
                "A focused service description for tests.", 100, "SAR", 24, 1, DateTimeOffset.UtcNow);
            db.Add(service);
        }
        await db.SaveChangesAsync();
        return new(user.Id, user.Email, subject.Id, otherSubject.Id, serviceType.Id, service?.Id);
    }

    private static object Service(Seeded teacher, Guid subjectId) => new
    {
        subjectId,
        serviceCatalogItemId = teacher.ServiceTypeId,
        title = (string?)null,
        description = "Service created against an eligible subject.",
        price = 125m,
        currency = "SAR",
        deliveryHours = 24,
        revisions = 1
    };

    private static async Task<string> CodeAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()!;

    private sealed record Seeded(
        string Id, string Email, Guid SubjectId, Guid OtherSubjectId, Guid ServiceTypeId, Guid? ServiceId);
}
