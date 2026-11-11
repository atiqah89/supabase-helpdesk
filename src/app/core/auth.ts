import { computed, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { Session } from '@supabase/supabase-js';
import { SupabaseService, unwrap } from './supabase';
import { Profile } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly isAgent = computed(() => this.profile()?.role === 'agent');

  private readonly ready: Promise<void>;

  constructor() {
    // getSession() also picks up the tokens from a magic-link redirect.
    this.ready = this.supabase.auth.getSession().then(async ({ data }) => {
      this.session.set(data.session);
      await this.loadProfile();
    });

    this.supabase.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      // Don't await other Supabase calls inside this callback: it runs while the auth
      // client holds its lock, and awaiting can deadlock. Defer to the next tick instead.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => void this.loadProfile());
      }
    });
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.profile.set(null);
  }

  private async loadProfile(): Promise<void> {
    const userId = this.session()?.user.id;
    if (!userId) {
      this.profile.set(null);
      return;
    }
    const profile = unwrap(
      await this.supabase.from('profiles').select('id, email, full_name, role').eq('id', userId).single(),
    ) as Profile;
    this.profile.set(profile);
  }
}

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return auth.session() ? true : router.createUrlTree(['/login']);
};
