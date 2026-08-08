using System.Net;
using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Tafseel.Application.Ai;
using Tafseel.Infrastructure.Ai;

namespace Tafseel.IntegrationTests;

public sealed class GroqAiProviderContractTests
{
    [Fact]
    public async Task Official_sdk_uses_custom_endpoint_and_strict_schema()
    {
        await using var server = new LocalChatServer(HttpStatusCode.OK, ValidDiscoveryResponse);
        var result = await Provider(server.Endpoint).InterpretIntentAsync(
            "I need calculus live", CancellationToken.None);

        Assert.Equal(AiProviderStatus.Success, result.Status);
        Assert.Equal("Calculus", result.Value!.SubjectText);
        Assert.Contains("\"type\":\"json_schema\"", server.LastRequestBody);
        Assert.Contains("\"strict\":true", server.LastRequestBody);
        Assert.DoesNotContain("\"tools\"", server.LastRequestBody);
        Assert.Equal(11, result.InputTokens);
        Assert.Equal(7, result.OutputTokens);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, AiProviderStatus.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden, AiProviderStatus.Forbidden)]
    [InlineData(HttpStatusCode.TooManyRequests, AiProviderStatus.RateLimited)]
    [InlineData(HttpStatusCode.InternalServerError, AiProviderStatus.Unavailable)]
    public async Task Provider_errors_are_classified_without_exposing_vendor_bodies(
        HttpStatusCode responseStatus, AiProviderStatus expected)
    {
        await using var server = new LocalChatServer(responseStatus,
            "{\"error\":{\"message\":\"SECRET_VENDOR_DETAIL\",\"type\":\"test\"}}");
        var result = await Provider(server.Endpoint).InterpretIntentAsync("Find math help", CancellationToken.None);
        Assert.Equal(expected, result.Status);
        Assert.Null(result.Value);
    }

    [Fact]
    public async Task Caller_cancellation_is_preserved()
    {
        await using var server = new LocalChatServer(HttpStatusCode.OK, ValidDiscoveryResponse, TimeSpan.FromSeconds(5));
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        var result = await Provider(server.Endpoint).InterpretIntentAsync("Find math help", cancellation.Token);
        Assert.Equal(AiProviderStatus.Cancelled, result.Status);
    }

    [Fact]
    public async Task Configured_timeout_is_classified()
    {
        await using var server = new LocalChatServer(HttpStatusCode.OK, ValidDiscoveryResponse, TimeSpan.FromSeconds(5));
        var result = await Provider(server.Endpoint).InterpretIntentAsync("Find math help", CancellationToken.None);
        Assert.Equal(AiProviderStatus.Timeout, result.Status);
    }

    [Fact]
    public async Task Invalid_structured_response_is_rejected()
    {
        await using var server = new LocalChatServer(HttpStatusCode.OK,
            ValidDiscoveryResponse.Replace("{\\\"intentType\\\"", "{\\\"unexpected\\\":true,\\\"intentType\\\""));
        var result = await Provider(server.Endpoint).InterpretIntentAsync("Find math help", CancellationToken.None);
        Assert.Equal(AiProviderStatus.InvalidResponse, result.Status);
    }

    private static GroqAiProvider Provider(string endpoint)
    {
        Environment.SetEnvironmentVariable("GROQ_API_KEY", "contract-test-key");
        return new GroqAiProvider(Options.Create(new AiOptions
        {
            Enabled = true,
            Endpoint = endpoint,
            Model = "openai/gpt-oss-120b",
            TimeoutSeconds = 2,
            MaxInputCharacters = 4000,
            MaxOutputTokens = 800
        }), NullLogger<GroqAiProvider>.Instance);
    }

    private const string ValidDiscoveryResponse = """
        {"id":"chatcmpl-test","object":"chat.completion","created":1,"model":"openai/gpt-oss-120b",
        "choices":[{"index":0,"message":{"role":"assistant","content":"{\"intentType\":\"find_teacher\",\"subjectText\":\"Calculus\",\"serviceIntent\":\"live_session\",\"serviceText\":null,\"preferredLanguageText\":null,\"educationLevelText\":null,\"maximumPrice\":null,\"needsClarification\":false,\"clarificationQuestions\":[]}"},"finish_reason":"stop"}],
        "usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}}
        """;

    private sealed class LocalChatServer : IAsyncDisposable
    {
        private readonly HttpListener _listener = new();
        private readonly CancellationTokenSource _stop = new();
        private readonly HttpStatusCode _status;
        private readonly string _response;
        private readonly TimeSpan _delay;
        private readonly Task _loop;
        public string Endpoint { get; }
        public string LastRequestBody { get; private set; } = "";

        public LocalChatServer(HttpStatusCode status, string response, TimeSpan delay = default)
        {
            _status = status;
            _response = response;
            _delay = delay;
            using var socket = new TcpListener(IPAddress.Loopback, 0);
            socket.Start();
            var port = ((IPEndPoint)socket.LocalEndpoint).Port;
            socket.Stop();
            Endpoint = $"http://127.0.0.1:{port}/openai/v1";
            _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
            _listener.Start();
            _loop = Task.Run(ListenAsync);
        }

        private async Task ListenAsync()
        {
            while (!_stop.IsCancellationRequested)
            {
                HttpListenerContext context;
                try
                {
                    context = await _listener.GetContextAsync();
                }
                catch (ObjectDisposedException)
                {
                    return;
                }
                catch (HttpListenerException)
                {
                    return;
                }
                catch (OperationCanceledException)
                {
                    return;
                }

                using var reader = new StreamReader(context.Request.InputStream, Encoding.UTF8);
                LastRequestBody = await reader.ReadToEndAsync();
                if (_delay > TimeSpan.Zero)
                {
                    try
                    {
                        await Task.Delay(_delay, _stop.Token);
                    }
                    catch (OperationCanceledException)
                    {
                        return;
                    }
                }

                if (_stop.IsCancellationRequested)
                {
                    return;
                }

                context.Response.StatusCode = (int)_status;
                context.Response.ContentType = "application/json";
                var bytes = Encoding.UTF8.GetBytes(_response);
                await context.Response.OutputStream.WriteAsync(bytes);
                context.Response.Close();
            }
        }

        public async ValueTask DisposeAsync()
        {
            _stop.Cancel();
            try
            {
                if (_listener.IsListening)
                {
                    _listener.Stop();
                }
            }
            catch (ObjectDisposedException)
            {
            }
            catch (HttpListenerException)
            {
            }

            try
            {
                await _loop;
            }
            catch (ObjectDisposedException)
            {
            }
            catch (HttpListenerException)
            {
            }
            catch (OperationCanceledException)
            {
            }

            _listener.Close();
            _stop.Dispose();
            Environment.SetEnvironmentVariable("GROQ_API_KEY", null);
        }
    }
}
