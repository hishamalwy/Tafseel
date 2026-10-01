import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

type Json = Record<string, any>;

export interface SignInDevice {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly isCurrent: boolean;
}

export interface NotificationSettings {
  readonly inAppEnabled: boolean;
  readonly emailEnabled: boolean;
}

export interface LearningSettings {
  readonly explanationStyle: string | null;
  readonly languageId: string | null;
  readonly version: string | null;
}

export interface LanguageOption { readonly id: string; readonly name: string; readonly nameAr: string | null }

/** `ExplanationStyleCodes.All`: stored codes, worded in the client. */
export const EXPLANATION_STYLES = ['step_by_step', 'short_direct', 'detailed', 'visual', 'exam_focused', 'practice_focused'] as const;

/** Everything a signed-in person manages about their own account, whatever their role. */
@Injectable({ providedIn: 'root' })
export class AccountSettingsGateway {
  private readonly http = inject(HttpClient);

  async me(): Promise<{ fullName: string; fullNameEnglish: string; email: string; hasAvatar: boolean; userId: string }> {
    const x = await firstValueFrom(this.http.get<Json>('/api/v1/auth/me'));
    return {
      fullName: String(x['fullName'] ?? ''), fullNameEnglish: String(x['fullNameEnglish'] ?? ''),
      email: String(x['email'] ?? ''), hasAvatar: !!x['hasAvatar'], userId: String(x['userId'] ?? '')
    };
  }

  saveProfile(fullName: string, fullNameEnglish: string): Promise<unknown> {
    return firstValueFrom(this.http.put('/api/v1/auth/profile', { fullName, fullNameEnglish }));
  }

  uploadAvatar(file: File): Promise<unknown> {
    const body = new FormData();
    body.append('file', file, file.name);
    return firstValueFrom(this.http.post('/api/v1/auth/avatar', body));
  }

  removeAvatar(): Promise<unknown> {
    return firstValueFrom(this.http.delete('/api/v1/auth/avatar'));
  }

  changePassword(currentPassword: string, newPassword: string): Promise<unknown> {
    return firstValueFrom(this.http.put('/api/v1/auth/password', { currentPassword, newPassword }));
  }

  async devices(): Promise<readonly SignInDevice[]> {
    const rows = await firstValueFrom(this.http.get<Json[]>('/api/v1/auth/sessions'));
    return (rows ?? []).map(x => ({
      id: String(x['id'] ?? ''), createdAt: String(x['createdAt'] ?? ''), expiresAt: String(x['expiresAt'] ?? ''), isCurrent: !!x['isCurrent']
    }));
  }

  signOutDevice(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/v1/auth/sessions/${encodeURIComponent(id)}`));
  }

  async signOutOthers(): Promise<number> {
    const x = await firstValueFrom(this.http.post<Json>('/api/v1/auth/sessions/sign-out-others', null));
    return Number(x?.['signedOut'] ?? 0);
  }

  async notifications(): Promise<NotificationSettings> {
    const x = await firstValueFrom(this.http.get<Json>('/api/v1/notification-preferences'));
    return { inAppEnabled: x?.['inAppEnabled'] !== false, emailEnabled: x?.['emailEnabled'] !== false };
  }

  saveNotifications(settings: NotificationSettings): Promise<unknown> {
    return firstValueFrom(this.http.put('/api/v1/notification-preferences', settings));
  }

  async learning(): Promise<LearningSettings> {
    const x = await firstValueFrom(this.http.get<Json>('/api/v1/students/me/learning-preferences'));
    return {
      explanationStyle: (x?.['explanationStyle'] as string | null) ?? null,
      languageId: (x?.['preferredTeachingLanguage']?.['id'] as string | null) ?? null,
      version: (x?.['version'] as string | null) ?? null
    };
  }

  async saveLearning(settings: LearningSettings): Promise<LearningSettings> {
    await firstValueFrom(this.http.put('/api/v1/students/me/learning-preferences', {
      explanationStyle: settings.explanationStyle, preferredTeachingLanguageId: settings.languageId, version: settings.version
    }));
    return this.learning();
  }

  async languages(): Promise<readonly LanguageOption[]> {
    const rows = await firstValueFrom(this.http.get<Json[]>('/api/v1/languages'));
    return (rows ?? []).map(x => ({ id: String(x['id'] ?? ''), name: String(x['name'] ?? ''), nameAr: (x['nameAr'] as string | null) ?? null }));
  }

  deleteAccount(password: string): Promise<unknown> {
    return firstValueFrom(this.http.delete('/api/v1/auth/account', { body: { password } }));
  }
}
