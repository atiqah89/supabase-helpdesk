import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="topbar">
      <a routerLink="/" class="brand">Helpdesk</a>
      @if (auth.session()) {
        <nav>
          <a routerLink="/tickets/new">New ticket</a>
          <span class="muted">
            {{ auth.profile()?.email }}
            @if (auth.isAgent()) { <span class="badge">agent</span> }
          </span>
          <button class="link" (click)="signOut()">Sign out</button>
        </nav>
      }
    </header>
    <main><router-outlet /></main>
  `,
})
export class App {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
