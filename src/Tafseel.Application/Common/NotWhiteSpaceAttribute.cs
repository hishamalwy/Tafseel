using System.ComponentModel.DataAnnotations;

namespace Tafseel.Application.Common;

[AttributeUsage(AttributeTargets.Parameter | AttributeTargets.Property)]
public sealed class NotWhiteSpaceAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) =>
        value is not string text || !string.IsNullOrWhiteSpace(text);
}
