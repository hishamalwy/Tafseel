using Tafseel.Application.Authorization;

namespace Tafseel.Application.Tests;

public sealed class PermissionTests
{
    [Fact]
    public void Admin_has_every_permission()
    {
        Assert.Equal(Permissions.All, Permissions.ForRole(Roles.Admin));
    }

    [Theory]
    [InlineData(Roles.Student, "Students.CreateRequests")]
    [InlineData(Roles.Teacher, "Requests.Accept")]
    [InlineData(Roles.QualityReviewer, "Teachers.ReviewApplications")]
    public void Role_has_its_required_permission(string role, string permission)
    {
        Assert.Contains(permission, Permissions.ForRole(role));
    }

    [Fact]
    public void Public_registration_excludes_privileged_roles()
    {
        Assert.DoesNotContain(Roles.Admin, Roles.PublicRegistration);
        Assert.DoesNotContain(Roles.QualityReviewer, Roles.PublicRegistration);
    }
}
