import { Injectable } from '@angular/core';
import { createClient, PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** One Supabase client for the whole app (it holds the auth session and the realtime socket). */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseKey);
}

/** Turns a PostgREST error into an Error with the code visible, which makes support tickets much easier to triage. */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) {
    const { code, message, hint } = result.error;
    throw new Error(`${message}${hint ? ` (${hint})` : ''} [${code}]`);
  }
  return result.data as T;
}
