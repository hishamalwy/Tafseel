namespace Tafseel.ArchitectureTests;

public sealed class DependencyTests
{
    [Fact]
    public void Clean_architecture_dependencies_point_inward()
    {
        AssertDoesNotReference(typeof(Domain.AssemblyReference).Assembly,
            "Tafseel.Application", "Tafseel.Infrastructure", "Tafseel.Api");
        AssertDoesNotReference(typeof(Application.Authentication.IAuthenticationService).Assembly,
            "Tafseel.Infrastructure", "Tafseel.Api");
        AssertDoesNotReference(typeof(Infrastructure.DependencyInjection).Assembly, "Tafseel.Api");
    }

    private static void AssertDoesNotReference(
        System.Reflection.Assembly assembly,
        params string[] forbidden)
    {
        var references = assembly.GetReferencedAssemblies().Select(x => x.Name).ToArray();
        foreach (var dependency in forbidden)
            Assert.DoesNotContain(dependency, references);
    }
}
