namespace Tafseel.Domain.Tests;

public sealed class DependencyTests
{
    [Fact]
    public void Domain_has_no_AspNetCore_or_EF_Core_dependency()
    {
        var references = typeof(Domain.AssemblyReference).Assembly
            .GetReferencedAssemblies()
            .Select(x => x.Name ?? "");

        Assert.DoesNotContain(references, name =>
            name.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal)
            || name.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal));
    }
}
