using System.Data.Common;
using System.Reflection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Tafseel.Application.Authorization;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

public sealed class IdentityStartupRetryTests
{
    [Theory]
    [InlineData(40613)]
    [InlineData(40197)]
    [InlineData(40501)]
    [InlineData(49918)]
    [InlineData(49919)]
    [InlineData(49920)]
    public void IsTransient_accepts_known_azure_sql_error_numbers(int number)
    {
        var exception = CreateSqlException(number);

        Assert.True(IdentityStartupRetry.IsTransient(exception, out var sqlErrorNumber));
        Assert.Equal(number, sqlErrorNumber);
    }

    [Fact]
    public void IsTransient_accepts_timeout_and_wrapped_sql_exceptions()
    {
        Assert.True(IdentityStartupRetry.IsTransient(new TimeoutException("timed out"), out var timeoutNumber));
        Assert.Null(timeoutNumber);

        var wrapped = new InvalidOperationException("wrapper", CreateSqlException(40613));
        Assert.True(IdentityStartupRetry.IsTransient(wrapped, out var wrappedNumber));
        Assert.Equal(40613, wrappedNumber);
    }

    [Theory]
    [InlineData(208)]   // Invalid object name
    [InlineData(18456)] // Login failed
    [InlineData(4060)]  // Cannot open database / bad credentials style failures
    public void IsTransient_rejects_non_transient_sql_errors(int number)
    {
        Assert.False(IdentityStartupRetry.IsTransient(CreateSqlException(number), out _));
        Assert.False(IdentityStartupRetry.IsTransient(new InvalidOperationException("schema missing"), out _));
    }

    [Fact]
    public async Task Transient_failure_is_retried_and_succeeds()
    {
        var attempts = 0;
        var logger = new CapturingLogger();

        await IdentityStartupRetry.ExecuteAsync(
            () =>
            {
                attempts++;
                if (attempts < 3)
                    throw CreateSqlException(40613);
                return Task.CompletedTask;
            },
            logger,
            _ => TimeSpan.Zero);

        Assert.Equal(3, attempts);
        Assert.Equal(2, logger.Warnings.Count);
        Assert.All(logger.Warnings, warning =>
        {
            Assert.Contains("attempt", warning, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("40613", warning, StringComparison.Ordinal);
        });
    }

    [Fact]
    public async Task Success_after_retry_completes_identity_initialization()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        var interceptor = new FailFirstCommandsInterceptor(failuresBeforeSuccess: 2);
        await using var services = BootstrapServices(database, interceptor).BuildServiceProvider();
        await EnsureCreated(services);

        IdentityStartupRetry.DelayFactoryOverride = _ => TimeSpan.Zero;
        try
        {
            await services.InitializeIdentityAsync();
        }
        finally
        {
            IdentityStartupRetry.DelayFactoryOverride = null;
        }

        Assert.True(interceptor.FailuresInjected >= 1);
        await using var scope = services.CreateAsyncScope();
        var roles = await scope.ServiceProvider.GetRequiredService<TafseelDbContext>()
            .Roles.Select(x => x.Name!).OrderBy(x => x).ToArrayAsync();
        Assert.Equal(Roles.All.Order(), roles);
    }

    [Fact]
    public async Task Non_transient_failure_fails_immediately_without_retry()
    {
        var attempts = 0;
        var logger = new CapturingLogger();

        var error = await Assert.ThrowsAsync<SqlException>(() => IdentityStartupRetry.ExecuteAsync(
            () =>
            {
                attempts++;
                throw CreateSqlException(208);
            },
            logger,
            _ => TimeSpan.Zero));

        Assert.Equal(208, error.Number);
        Assert.Equal(1, attempts);
        Assert.Empty(logger.Warnings);
    }

    [Fact]
    public async Task Retry_limit_is_enforced_and_final_failure_is_not_swallowed()
    {
        var attempts = 0;
        var logger = new CapturingLogger();

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => IdentityStartupRetry.ExecuteAsync(
            () =>
            {
                attempts++;
                throw CreateSqlException(40613);
            },
            logger,
            _ => TimeSpan.Zero));

        Assert.Equal(IdentityStartupRetry.MaxAttempts, attempts);
        Assert.Equal(IdentityStartupRetry.MaxAttempts - 1, logger.Warnings.Count);
        Assert.Contains("failed after 5 attempts", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("40613", error.Message, StringComparison.Ordinal);
        Assert.IsType<SqlException>(error.InnerException);
        Assert.Equal(40613, ((SqlException)error.InnerException!).Number);
    }

    private static ServiceCollection BootstrapServices(SqliteConnection database, IInterceptor interceptor)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<TafseelDbContext>(options =>
            options.UseSqlite(database).AddInterceptors(interceptor));
        services.AddIdentityCore<ApplicationUser>()
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<TafseelDbContext>();
        return services;
    }

    private static async Task EnsureCreated(ServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.EnsureCreatedAsync();
    }

    private sealed class FailFirstCommandsInterceptor(int failuresBeforeSuccess) : DbCommandInterceptor
    {
        private int _remaining = failuresBeforeSuccess;
        public int FailuresInjected { get; private set; }

        public override InterceptionResult<DbDataReader> ReaderExecuting(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
            => ThrowIfNeeded(result);

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
            => new(ThrowIfNeeded(result));

        private InterceptionResult<DbDataReader> ThrowIfNeeded(InterceptionResult<DbDataReader> result)
        {
            if (System.Threading.Interlocked.Decrement(ref _remaining) >= 0)
            {
                FailuresInjected++;
                throw CreateSqlException(40613);
            }

            return result;
        }
    }

    private static SqlException CreateSqlException(int number)
    {
        var errorCtors = typeof(SqlError).GetConstructors(BindingFlags.NonPublic | BindingFlags.Instance);
        object? error = null;
        foreach (var ctor in errorCtors.OrderByDescending(c => c.GetParameters().Length))
        {
            var parameters = ctor.GetParameters();
            var args = new object?[parameters.Length];
            for (var i = 0; i < parameters.Length; i++)
            {
                var type = parameters[i].ParameterType;
                args[i] = type == typeof(int) ? number
                    : type == typeof(byte) ? (byte)0
                    : type == typeof(string) ? parameters[i].Name is "server" or "serverName" ? "test-server" : "transient"
                    : type == typeof(Exception) ? null
                    : type.IsValueType ? Activator.CreateInstance(type)
                    : null;
            }

            try
            {
                error = ctor.Invoke(args);
                break;
            }
            catch
            {
                // try next ctor signature
            }
        }

        Assert.NotNull(error);

        var errors = (SqlErrorCollection)Activator.CreateInstance(
            typeof(SqlErrorCollection),
            BindingFlags.NonPublic | BindingFlags.Instance,
            binder: null,
            args: null,
            culture: null)!;
        typeof(SqlErrorCollection)
            .GetMethod("Add", BindingFlags.NonPublic | BindingFlags.Instance)!
            .Invoke(errors, [error]);

        var createException = typeof(SqlException)
            .GetMethods(BindingFlags.NonPublic | BindingFlags.Static)
            .First(m => m.Name == "CreateException"
                && m.GetParameters() is [{ ParameterType: var first }, ..]
                && first == typeof(SqlErrorCollection));

        var createArgs = createException.GetParameters().Select(p =>
            p.ParameterType == typeof(SqlErrorCollection) ? (object)errors
            : p.ParameterType == typeof(string) ? "11.0.0"
            : p.ParameterType == typeof(Exception) ? null
            : p.ParameterType == typeof(Guid) ? Guid.Empty
            : p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType)!
            : null!).ToArray();

        return (SqlException)createException.Invoke(null, createArgs)!;
    }

    private sealed class CapturingLogger : ILogger
    {
        public List<string> Warnings { get; } = [];

        public IDisposable BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (logLevel == LogLevel.Warning)
                Warnings.Add(formatter(state, exception));
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            public void Dispose() { }
        }
    }
}
