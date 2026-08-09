using System.Globalization;
using System.ComponentModel.DataAnnotations;
using System.Text;
using Microsoft.Extensions.Options;
using Tafseel.Application.Ai;
using Tafseel.Application.Catalog;
using Tafseel.Domain.Catalog;

namespace Tafseel.Infrastructure.Ai;

internal sealed class AiMarketplaceAssistant(
    IAiProvider provider,
    ICatalogService catalog,
    IOptions<AiOptions> options,
    TimeProvider clock) : IAiMarketplaceAssistant
{
    private readonly AiOptions _options = options.Value;
    private static readonly HashSet<string> IntentTypes =
        ["find_teacher", "understand_service", "start_request", "book_live_session", "needs_clarification"];
    private static readonly HashSet<string> ServiceIntents = ["unknown", "async_request", "live_session"];

    public async Task<AiDiscoveryResult> InterpretDiscoveryAsync(AiDiscoveryInput input, CancellationToken ct)
    {
        var text = NormalizeInput(input.Input, _options.MaxInputCharacters);
        var response = await provider.InterpretIntentAsync(text, ct);
        if (!response.IsSuccess)
            return Unavailable(response.Status);

        var candidate = response.Value!;
        if (!IntentTypes.Contains(candidate.IntentType)
            || !ServiceIntents.Contains(candidate.ServiceIntent)
            || candidate.ClarificationQuestions.Length > 2
            || candidate.MaximumPrice is <= 0 or > 1_000_000)
            return Unavailable(AiProviderStatus.InvalidResponse);

        var subjects = await catalog.GetSubjectsAsync(false, ct);
        var services = (await catalog.GetServicesAsync(false, ct))
            .Where(x => x.IsActive && x.IsPublic == true && x.TeacherSelectable == true).ToArray();
        var languages = await catalog.GetLanguagesAsync(false, ct);
        var levels = await catalog.GetEducationLevelsAsync(false, ct);

        var questions = new List<string>();
        var subject = DiscoveryCatalogResolver.ResolveSubject(
            candidate.SubjectText, candidate.TopicContext, subjects);
        var service = DiscoveryCatalogResolver.ResolveService(
            candidate.ServiceIntent, candidate.ServiceText, services);
        var language = DiscoveryCatalogResolver.ResolveNames(candidate.PreferredLanguageText, languages);
        var level = DiscoveryCatalogResolver.ResolveNames(candidate.EducationLevelText, levels);
        var zone = ResolveZone(input.ViewerTimeZoneId);
        var availableOn = DiscoveryCalendar.ResolveUpcoming(
            candidate.AvailabilityDayText, candidate.AvailabilityDateText, clock.GetUtcNow(), zone);
        var arabic = DiscoveryText.HasArabic(text);

        if (subject.IsAmbiguous)
            AddQuestion(questions, arabic
                ? $"أي مادة تقصد: {string.Join("، ", subject.Items.Take(3).Select(x => x.NameAr ?? x.Name))}؟"
                : $"Please choose the exact subject: {string.Join(", ", subject.Items.Take(3).Select(x => x.Name))}.");
        if (service.IsAmbiguous)
            AddQuestion(questions, arabic
                ? "هل تريد جلسة مباشرة أم شرحًا غير متزامن؟"
                : "Do you need a live session or an asynchronous request?");
        if (!string.IsNullOrWhiteSpace(candidate.PreferredLanguageText) && language.IsEmpty)
            AddQuestion(questions, arabic ? "ما لغة التدريس المطلوبة؟" : "Which teaching language did you mean?");
        if (!string.IsNullOrWhiteSpace(candidate.EducationLevelText) && level.IsEmpty)
            AddQuestion(questions, arabic ? "ما المرحلة الدراسية المطلوبة؟" : "Which education level did you mean?");

        var dayRequested = !string.IsNullOrWhiteSpace(candidate.AvailabilityDayText)
            || !string.IsNullOrWhiteSpace(candidate.AvailabilityDateText);
        if (dayRequested && availableOn is null)
            AddQuestion(questions, arabic ? "أي يوم تقصد للتوفر؟" : "Which day should we use for availability?");

        var subjectNeeded = candidate.IntentType is not "understand_service"
            && subject.IsEmpty
            && (string.IsNullOrWhiteSpace(candidate.SubjectText)
                && string.IsNullOrWhiteSpace(candidate.TopicContext)
                || !string.IsNullOrWhiteSpace(candidate.SubjectText));
        if (subjectNeeded)
            AddQuestion(questions, arabic ? "ما المادة التي تحتاج مساعدة فيها؟" : "Which subject do you need help with?");

        var serviceUnclear = dayRequested && service.IsEmpty && candidate.ServiceIntent == "unknown"
            && string.IsNullOrWhiteSpace(candidate.ServiceText);
        if (serviceUnclear)
            AddQuestion(questions, arabic
                ? "هل تحتاج جلسة مباشرة أم خدمة غير متزامنة؟"
                : "Do you need a live session or an asynchronous service?");

        var filters = new AiResolvedDiscoveryFilters(
            subject.Single?.Id, subject.Single?.Name, subject.Single?.NameAr,
            service.Single?.Id, service.Single?.NameEn ?? service.Single?.Name,
            service.Single?.NameAr, candidate.MaximumPrice,
            language.Single?.Id, language.Single?.Name, language.Single?.NameAr,
            level.Single?.Id, level.Single?.Name, level.Single?.NameAr,
            "name",
            availableOn,
            availableOn is { } date ? DiscoveryCalendar.WeekdayLabel(date, arabic) : null,
            string.IsNullOrWhiteSpace(candidate.TopicContext) ? null : candidate.TopicContext.Trim(),
            zone.Id);

        var importantBlocked = questions.Count > 0;
        if (importantBlocked && input.ClarificationRound < 2)
            return new(AiAssistantStatuses.NeedsClarification,
                arabic
                    ? "نحتاج توضيحًا واحدًا قبل تطبيق فلاتر السوق."
                    : "Please clarify the missing details before Tafseel applies marketplace filters.",
                true, questions.Take(2).ToArray(), filters);

        if (importantBlocked)
            return new(AiAssistantStatuses.NoCanonicalMatch,
                arabic
                    ? "تعذر مطابقة كل التفاصيل بأمان. تابع بالفلاتر العادية."
                    : "Tafseel could not safely map every detail. Use the normal filters to continue.",
                false, [], filters);

        return new(AiAssistantStatuses.Success,
            arabic
                ? "طُبقت الفلاتر المستخلصة من طلبك. ترتيب المعلمين يبقى ترتيب تفصيل المعتاد."
                : "These filters were interpreted from your request. Teacher results keep Tafseel's normal eligibility and ordering.",
            false, [], filters);
    }

    public async Task<AiRequestAssistantResult> AssistRequestAsync(
        AiRequestAssistantInput input, CancellationToken ct)
    {
        var notes = NormalizeInput(input.Notes, _options.MaxInputCharacters);
        var response = await provider.AssistRequestAsync(notes, ct);
        if (!response.IsSuccess)
            return new(AiAssistantStatuses.Unavailable, UnavailableMessage(response.Status));

        var draft = response.Value!;
        if (string.IsNullOrWhiteSpace(draft.Title)
            || string.IsNullOrWhiteSpace(draft.Goal)
            || string.IsNullOrWhiteSpace(draft.SuggestedDescription)
            || draft.Title.Length > 200 || draft.Goal.Length > 1000
            || draft.SuggestedDescription.Length > 4000
            || draft.DifficultTopics.Length > 8 || draft.MissingInformation.Length > 5
            || !DeadlineIsSupported(notes, draft.DeadlineMentioned))
            return new(AiAssistantStatuses.Unavailable, UnavailableMessage(AiProviderStatus.InvalidResponse));

        return new(AiAssistantStatuses.Success,
            "AI-assisted draft ready. Review, edit, use, or discard it before submitting.", draft);
    }

    public async Task<AiProductHelpResult> AnswerProductHelpAsync(
        AiProductHelpInput input, CancellationToken ct)
    {
        var question = NormalizeInput(input.Question, Math.Min(1000, _options.MaxInputCharacters));
        var approvedContext = ProductHelpContext.For(question);
        if (approvedContext is null)
            return new(AiAssistantStatuses.Unsupported,
                "That policy is not available in Tafseel's approved help content. Please use the relevant product page or contact support.");

        var response = await provider.AnswerProductHelpAsync(question, approvedContext, ct);
        if (!response.IsSuccess)
            return new(AiAssistantStatuses.Unavailable, UnavailableMessage(response.Status));
        var answer = response.Value!;
        if (!answer.Supported || string.IsNullOrWhiteSpace(answer.Answer) || answer.Answer.Length > 1200)
            return new(AiAssistantStatuses.Unsupported,
                "That policy is not available in Tafseel's approved help content. Please use the relevant product page or contact support.");
        return new(AiAssistantStatuses.Success, answer.Answer.Trim());
    }

    private static string NormalizeInput(string input, int maxLength)
    {
        var normalized = string.Join(' ', input.Split(
            (char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        if (normalized.Length is < 3 || normalized.Length > maxLength)
            throw new ValidationException($"AI input must be between 3 and {maxLength} characters.");
        return normalized;
    }

    private static void AddQuestion(ICollection<string> questions, string question)
    {
        if (questions.Count < 2 && !questions.Contains(question)) questions.Add(question.Trim());
    }

    private static TimeZoneInfo ResolveZone(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return TimeZoneInfo.Utc;
        try { return TimeZoneInfo.FindSystemTimeZoneById(id.Trim()); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
        catch (InvalidTimeZoneException) { return TimeZoneInfo.Utc; }
    }

    private static string Key(string value) => DiscoveryText.Key(value);

    private static bool DeadlineIsSupported(string input, string? deadline)
    {
        if (string.IsNullOrWhiteSpace(deadline)) return true;
        var source = Key(input);
        return Key(deadline).Split(' ', StringSplitOptions.RemoveEmptyEntries).All(source.Contains);
    }

    private static AiDiscoveryResult Unavailable(AiProviderStatus status) =>
        new(AiAssistantStatuses.Unavailable, UnavailableMessage(status), false, []);

    private static string UnavailableMessage(AiProviderStatus status) => status switch
    {
        AiProviderStatus.RateLimited => "AI assistance is busy right now. Continue with Tafseel's normal filters and try again later.",
        AiProviderStatus.Timeout => "AI assistance timed out. Continue with Tafseel's normal flow and try again later.",
        _ => "AI assistance is temporarily unavailable. Tafseel's normal marketplace flow is still available."
    };

    private static class ProductHelpContext
    {
        private const string Services = """
            Tafseel has asynchronous Learning Request services, including a recorded explanation,
            and scheduled live-session services. A recorded explanation is a custom recorded
            walkthrough of the student's stated topic. Live sessions are booked through Book Session,
            not through Learning Requests. Only active public services offered by a teacher currently
            qualified for the same subject appear in marketplace discovery.
            """;
        private const string Requests = """
            A Student chooses a real Teacher service, enters request details, may attach files, chooses
            a preferred delivery date and budget preference, reviews the composed description and terms,
            and explicitly submits. The teacher may then accept or decline. AI drafts never submit a request.
            """;
        private const string Payments = """
            For a Learning Request, payment is required after the teacher accepts and before work starts.
            Payment confirmation comes from the configured payment provider webhook; Tafseel does not
            collect card details on its page. A confirmed payment is held and released after the Student
            approves delivery under Tafseel's order flow.
            """;
        private const string Qualifications = """
            Public discovery requires a current approved, non-revoked Teacher qualification for the same
            active subject and an active, non-superseded Teacher service from the public Service Catalog.
            AI never approves qualifications or makes Teachers visible.
            """;

        internal static string? For(string question)
        {
            var key = Key(question);
            if (Has(key, "refund", "privacy", "fee", "commission", "استرداد", "خصوصيه", "خصوصية", "رسوم", "عموله", "عمولة"))
                return null;
            if (Has(key, "payment", "pay", "card", "دفع", "بطاقه", "بطاقة")) return Payments;
            if (Has(key, "qualified", "qualification", "teacher approval", "مؤهل", "تاهيل", "تأهيل", "اعتماد المعلم")) return Qualifications;
            if (Has(key, "request", "submit", "attachment", "طلب", "ارسل", "إرسال", "مرفق")) return Requests;
            if (Has(key, "recorded", "explanation", "live", "session", "service", "شرح", "مسجل", "جلسه", "جلسة", "خدمه", "خدمة")) return Services;
            return null;
        }

        private static bool Has(string value, params string[] terms) => terms.Any(value.Contains);
    }
}
