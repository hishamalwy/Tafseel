namespace Tafseel.Infrastructure.Ai;

public sealed class AiOptions
{
    public const string SectionName = "Ai";

    public bool Enabled { get; init; }
    public string Provider { get; init; } = "Groq";
    public string Endpoint { get; init; } = "https://api.groq.com/openai/v1";
    public string Model { get; init; } = "openai/gpt-oss-120b";
    public int TimeoutSeconds { get; init; } = 20;
    public int MaxInputCharacters { get; init; } = 4000;
    public int MaxOutputTokens { get; init; } = 800;
}
