import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-login',
  template: `
    <section class="card narrow">
      <h1>Sign in</h1>
      @if (sent()) {
        <p>Check <strong>{{ email() }}</strong> for a sign-in link.</p>
        <p class="muted">Running locally? Emails go to Mailpit at <a href="http://127.0.0.1:54324" target="_blank">127.0.0.1:54324</a>.</p>
      } @else {
        <form (submit)="submit($event)">
          <label>Email
            <input type="email" required autocomplete="email" [value]="email()" (input)="email.set(value($event))" />
          </label>
          <button type="submit" [disabled]="busy()">{{ busy() ? 'Sending…' : 'Email me a magic link' }}</button>
        </form>
      }
      @if (error()) { <p class="error">{{ error() }}</p> }
    </section>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  readonly email = signal('');
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal('');

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.sendMagicLink(this.email().trim());
      this.sent.set(true);
    } catch (err) {
      // e.g. 429 "email rate limit exceeded": the default SMTP allows only a few emails per hour.
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
