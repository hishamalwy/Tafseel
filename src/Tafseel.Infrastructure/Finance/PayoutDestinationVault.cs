using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;

namespace Tafseel.Infrastructure.Finance;

/// <summary>
/// Key material for sealing payout destinations (DEC-04). Supplied only by the environment's secret store
/// (environment variables / managed secret store / user secrets) — never by appsettings or the repository:
/// <c>PayoutDestinations__ActiveKeyId</c> and <c>PayoutDestinations__Keys__{keyId}</c> (base64, 32 random bytes).
/// Older keys stay listed until nothing sealed with them is still needed; see the manual payout runbook.
/// </summary>
public sealed class PayoutDestinationOptions
{
    public const string SectionName = "PayoutDestinations";
    public string ActiveKeyId { get; init; } = "";
    public Dictionary<string, string> Keys { get; init; } = new(StringComparer.Ordinal);

    /// <summary>True when the active key exists and every listed key is a usable 256-bit key.</summary>
    public bool IsUsable(out string problem)
    {
        problem = "";
        if (string.IsNullOrWhiteSpace(ActiveKeyId))
        {
            problem = "PayoutDestinations:ActiveKeyId is not set.";
            return false;
        }
        if (!Keys.ContainsKey(ActiveKeyId))
        {
            problem = "PayoutDestinations:Keys does not contain the active key.";
            return false;
        }
        foreach (var (id, value) in Keys)
        {
            if (id.Length is 0 or > 32 || !id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.'))
            {
                problem = "A PayoutDestinations key id is invalid.";
                return false;
            }
            if (TryDecode(value) is null)
            {
                problem = $"PayoutDestinations key '{id}' must be 32 random bytes, base64-encoded.";
                return false;
            }
        }
        return true;
    }

    internal static byte[]? TryDecode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.StartsWith("REPLACE_", StringComparison.Ordinal)) return null;
        try
        {
            var key = Convert.FromBase64String(value.Trim());
            // All-zero or single-byte-repeated material is a placeholder, not a key.
            return key.Length == 32 && key.Distinct().Count() > 1 ? key : null;
        }
        catch (FormatException)
        {
            return null;
        }
    }
}

/// <summary>
/// AES-256-GCM sealing of full bank destinations. The ciphertext is bound to the teacher and the key id
/// through associated data, so a sealed destination cannot be moved onto another teacher's profile or
/// withdrawal. Missing or invalid key material fails closed: nothing is stored and nothing is opened.
/// </summary>
internal sealed class AesGcmPayoutDestinationVault(IOptions<PayoutDestinationOptions> options) : IPayoutDestinationVault
{
    private const byte FormatVersion = 1;
    private const int NonceSize = 12;
    private const int TagSize = 16;

    public SealedPayoutDestination Seal(string teacherId, BankTransferDestination destination)
    {
        var settings = Usable();
        var keyId = settings.ActiveKeyId;
        var key = PayoutDestinationOptions.TryDecode(settings.Keys[keyId])!;
        var plaintext = JsonSerializer.SerializeToUtf8Bytes(new Payload(
            destination.BeneficiaryName, destination.BankName, destination.Iban, destination.CountryCode));
        try
        {
            var blob = new byte[1 + NonceSize + TagSize + plaintext.Length];
            blob[0] = FormatVersion;
            var nonce = blob.AsSpan(1, NonceSize);
            RandomNumberGenerator.Fill(nonce);
            using var aes = new AesGcm(key, TagSize);
            aes.Encrypt(nonce, plaintext, blob.AsSpan(1 + NonceSize + TagSize), blob.AsSpan(1 + NonceSize, TagSize),
                AssociatedData(teacherId, keyId));
            return new SealedPayoutDestination(keyId, blob);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
            CryptographicOperations.ZeroMemory(key);
        }
    }

    public BankTransferDestination Open(string teacherId, SealedPayoutDestination destination)
    {
        var settings = Usable();
        if (!settings.Keys.TryGetValue(destination.KeyId, out var encoded)
            || PayoutDestinationOptions.TryDecode(encoded) is not { } key)
            throw new DomainException("payout_destination_key_unavailable",
                "The key that protects these payout details is not available.");
        var blob = destination.Ciphertext;
        if (blob.Length <= 1 + NonceSize + TagSize || blob[0] != FormatVersion)
            throw Unreadable();
        var plaintext = new byte[blob.Length - 1 - NonceSize - TagSize];
        try
        {
            using var aes = new AesGcm(key, TagSize);
            aes.Decrypt(blob.AsSpan(1, NonceSize), blob.AsSpan(1 + NonceSize + TagSize),
                blob.AsSpan(1 + NonceSize, TagSize), plaintext, AssociatedData(teacherId, destination.KeyId));
            var payload = JsonSerializer.Deserialize<Payload>(plaintext) ?? throw Unreadable();
            return BankTransferDestination.Create(payload.Beneficiary, payload.Bank, payload.Iban, payload.Country);
        }
        catch (CryptographicException)
        {
            throw Unreadable();
        }
        catch (JsonException)
        {
            throw Unreadable();
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
            CryptographicOperations.ZeroMemory(key);
        }
    }

    private PayoutDestinationOptions Usable()
    {
        var settings = options.Value;
        return settings.IsUsable(out _)
            ? settings
            : throw new DomainException("payout_vault_unavailable",
                "Secure storage for payout details is not configured, so bank details cannot be saved or read.");
    }

    private static byte[] AssociatedData(string teacherId, string keyId) =>
        Encoding.UTF8.GetBytes($"tafseel/payout-destination/v1|{teacherId}|{keyId}");

    private static DomainException Unreadable() =>
        new("payout_destination_unreadable", "These payout details could not be read.");

    private sealed record Payload(string Beneficiary, string Bank, string Iban, string Country);
}
