using System.ClientModel;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OpenAI;
using OpenAI.Chat;
using Tafseel.Application.Ai;

namespace Tafseel.Infrastructure.Ai;

internal sealed class GroqAiProvider : IAiProvider
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AiOptions _options;
    private readonly ILogger<GroqAiProvider> _logger;
    private readonly ChatClient? _client;

    public GroqAiProvider(IOptions<AiOptions> options, ILogger<GroqAiProvider> logger)
    {
        _options = options.Value;
        _logger = logger;
        var apiKey = Environment.GetEnvironmentVariable("GROQ_API_KEY");
        if (_options.Enabled && !string.IsNullOrWhiteSpace(apiKey))
        {
            _client = new ChatClient(
                _options.Model,
                new ApiKeyCredential(apiKey),
                new OpenAIClientOptions { Endpoint = new Uri(_options.Endpoint, UriKind.Absolute) });
        }
    }

    public Task<AiProviderResult<AiDiscoveryCandidate>> InterpretIntentAsync(string input, CancellationToken ct) =>
        CompleteAsync<AiDiscoveryCandidate>(
            "discovery", AiPrompts.Discovery, input, "tafseel_discovery_intent", DiscoverySchema, ct);

    public Task<AiProviderResult<AiRequestDraftCandidate>> AssistRequestAsync(string input, CancellationToken ct) =>
        CompleteAsync<AiRequestDraftCandidate>(
            "request_assistant", AiPrompts.RequestAssistant, input, "tafseel_request_draft", RequestSchema, ct);

    public Task<AiProviderResult<AiProductHelpCandidate>> AnswerProductHelpAsync(
        string question, string approvedContext, CancellationToken ct) =>
        CompleteAsync<AiProductHelpCandidate>(
            "product_help", AiPrompts.ProductHelp(approvedContext), question, "tafseel_product_help", HelpSchema, ct);

    private async Task<AiProviderResult<T>> CompleteAsync<T>(
        string feature, string instructions, string input, string schemaName, BinaryData schema,
        CancellationToken ct)
    {
        if (!_options.Enabled)
            return new(AiProviderStatus.Disabled);
        if (_client is null)
            return new(AiProviderStatus.MissingCredentials);
        if (input.Length > _options.MaxInputCharacters)
            return new(AiProviderStatus.InvalidResponse);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(_options.TimeoutSeconds));
        var started = Stopwatch.GetTimestamp();
        try
        {
            ChatCompletion completion = await _client.CompleteChatAsync(
                [new SystemChatMessage(instructions), new UserChatMessage(input)],
                new ChatCompletionOptions
                {
                    MaxOutputTokenCount = _options.MaxOutputTokens,
                    ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                        schemaName, schema, jsonSchemaIsStrict: true)
                },
                timeout.Token);
            var text = completion.Content.Count > 0 ? completion.Content[0].Text : null;
            if (string.IsNullOrWhiteSpace(text))
                return Log<T>(feature, AiProviderStatus.InvalidResponse, started);

            try
            {
                var value = JsonSerializer.Deserialize<T>(text, JsonOptions);
                return value is null
                    ? Log<T>(feature, AiProviderStatus.InvalidResponse, started)
                    : Log(feature, AiProviderStatus.Success, started, value,
                        completion.Usage?.InputTokenCount, completion.Usage?.OutputTokenCount);
            }
            catch (JsonException)
            {
                return Log<T>(feature, AiProviderStatus.InvalidResponse, started);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return Log<T>(feature, AiProviderStatus.Cancelled, started);
        }
        catch (OperationCanceledException)
        {
            return Log<T>(feature, AiProviderStatus.Timeout, started);
        }
        catch (ClientResultException exception)
        {
            var status = exception.Status switch
            {
                401 => AiProviderStatus.Unauthorized,
                403 => AiProviderStatus.Forbidden,
                429 => AiProviderStatus.RateLimited,
                >= 500 => AiProviderStatus.Unavailable,
                _ => AiProviderStatus.InvalidResponse
            };
            return Log<T>(feature, status, started);
        }
        catch (HttpRequestException)
        {
            return Log<T>(feature, AiProviderStatus.Unavailable, started);
        }
    }

    private AiProviderResult<T> Log<T>(
        string feature, AiProviderStatus status, long started, T? value = default,
        int? inputTokens = null, int? outputTokens = null)
    {
        _logger.LogInformation(
            "AI operation completed. Feature={Feature} Provider=Groq Model={Model} PromptVersion={PromptVersion} Status={Status} LatencyMs={LatencyMs} InputTokens={InputTokens} OutputTokens={OutputTokens}",
            feature, _options.Model, AiPrompts.Version, status,
            Stopwatch.GetElapsedTime(started).TotalMilliseconds, inputTokens, outputTokens);
        return new(status, value, inputTokens, outputTokens);
    }

    private static readonly BinaryData DiscoverySchema = BinaryData.FromString("""
        {"type":"object","additionalProperties":false,"properties":{
          "intentType":{"type":"string","enum":["find_teacher","understand_service","start_request","book_live_session","needs_clarification"]},
          "subjectText":{"type":["string","null"],"maxLength":200},
          "serviceIntent":{"type":"string","enum":["unknown","async_request","live_session"]},
          "serviceText":{"type":["string","null"],"maxLength":200},
          "preferredLanguageText":{"type":["string","null"],"maxLength":100},
          "educationLevelText":{"type":["string","null"],"maxLength":100},
          "maximumPrice":{"type":["number","null"],"minimum":1,"maximum":1000000},
          "needsClarification":{"type":"boolean"},
          "clarificationQuestions":{"type":"array","maxItems":2,"items":{"type":"string","maxLength":300}}
        },"required":["intentType","subjectText","serviceIntent","serviceText","preferredLanguageText","educationLevelText","maximumPrice","needsClarification","clarificationQuestions"]}
        """);

    private static readonly BinaryData RequestSchema = BinaryData.FromString("""
        {"type":"object","additionalProperties":false,"properties":{
          "title":{"type":"string","maxLength":200},
          "goal":{"type":"string","maxLength":1000},
          "difficultTopics":{"type":"array","maxItems":8,"items":{"type":"string","maxLength":200}},
          "desiredOutcome":{"type":"string","maxLength":500},
          "deadlineMentioned":{"type":["string","null"],"maxLength":200},
          "missingInformation":{"type":"array","maxItems":5,"items":{"type":"string","maxLength":300}},
          "suggestedDescription":{"type":"string","maxLength":4000}
        },"required":["title","goal","difficultTopics","desiredOutcome","deadlineMentioned","missingInformation","suggestedDescription"]}
        """);

    private static readonly BinaryData HelpSchema = BinaryData.FromString("""
        {"type":"object","additionalProperties":false,"properties":{
          "answer":{"type":"string","maxLength":1200},
          "supported":{"type":"boolean"}
        },"required":["answer","supported"]}
        """);
}
