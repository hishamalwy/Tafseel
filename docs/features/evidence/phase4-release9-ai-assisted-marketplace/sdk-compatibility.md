# .NET SDK Compatibility

Selected package: official `OpenAI` .NET SDK 2.12.0.

Compatibility is proven by eight local HTTP contract tests through the real SDK client. They verify custom endpoint routing, model selection, strict JSON Schema payload, no tools, non-streaming response parsing, usage extraction, 401/403/429/500 mapping, configured timeout, caller cancellation, and invalid structured-response handling. Package restore and lock files are current.

The SDK has bounded built-in retry behavior for transient responses; no Polly loop, model cascade, or application retry fan-out was added.

Sources: https://github.com/openai/openai-dotnet and https://www.nuget.org/packages/OpenAI/2.12.0.
