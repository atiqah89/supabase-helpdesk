import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { TicketService } from '../core/tickets';
import { STATUSES, Ticket, TicketStatus } from '../core/models';

@Component({
  selector: 'app-ticket-list',
  imports: [RouterLink, DatePipe],
  template: `
    <div class="row between">
      <h1>{{ auth.isAgent() ? 'All tickets' : 'My tickets' }}</h1>
      <label class="inline">Status
        <select [value]="status()" (change)="setStatus($event)">
          <option value="all">All</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </label>
    </div>

    @if (error()) { <p class="error">{{ error() }}</p> }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (tickets().length === 0) {
      <div class="card empty">
        <p>No tickets here.</p>
        <a routerLink="/tickets/new">Open a ticket</a>
      </div>
    } @else {
      <table>
        <thead>
          <tr><th>#</th><th>Subject</th>@if (auth.isAgent()) {<th>Requester</th>}<th>Priority</th><th>Status</th><th>Updated</th></tr>
        </thead>
        <tbody>
          @for (t of tickets(); track t.id) {
            <tr>
              <td>{{ t.id }}</td>
              <td><a [routerLink]="['/tickets', t.id]">{{ t.subject }}</a></td>
              @if (auth.isAgent()) { <td>{{ t.requester?.full_name || t.requester?.email }}</td> }
              <td><span class="pill" [class]="'p-' + t.priority">{{ t.priority }}</span></td>
              <td><span class="pill" [class]="'s-' + t.status">{{ t.status }}</span></td>
              <td>{{ t.updated_at | date: 'short' }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class TicketListPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly tickets$ = inject(TicketService);

  readonly statuses = STATUSES;
  readonly status = signal<TicketStatus | 'all'>('all');
  readonly tickets = signal<Ticket[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    void this.load();
  }

  setStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as TicketStatus | 'all');
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.tickets.set(await this.tickets$.list(this.status()));
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
