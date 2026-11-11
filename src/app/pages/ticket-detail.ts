import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { TicketService } from '../core/tickets';
import { STATUSES, Ticket, TicketComment, TicketStatus } from '../core/models';

@Component({
  selector: 'app-ticket-detail',
  imports: [DatePipe, RouterLink],
  template: `
    <p><a routerLink="/">← Back to tickets</a></p>
    @if (error()) { <p class="error">{{ error() }}</p> }

    @if (ticket(); as t) {
      <section class="card">
        <div class="row between">
          <h1>#{{ t.id }} {{ t.subject }}</h1>
          @if (auth.isAgent()) {
            <select [value]="t.status" (change)="changeStatus($event)" aria-label="Status">
              @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
            </select>
          } @else {
            <span class="pill" [class]="'s-' + t.status">{{ t.status }}</span>
          }
        </div>
        <p class="muted">
          {{ t.requester?.full_name || t.requester?.email }} · {{ t.created_at | date: 'medium' }} ·
          <span class="pill" [class]="'p-' + t.priority">{{ t.priority }}</span>
        </p>
        <p class="pre">{{ t.description }}</p>
      </section>

      <h2>Conversation</h2>
      @for (c of comments(); track c.id) {
        <article class="comment" [class.internal]="c.is_internal" [class.agent]="c.author?.role === 'agent'">
          <header>
            <strong>{{ c.author?.full_name || c.author?.email }}</strong>
            @if (c.author?.role === 'agent') { <span class="badge">support</span> }
            @if (c.is_internal) { <span class="badge internal">internal note</span> }
            <span class="muted">{{ c.created_at | date: 'short' }}</span>
          </header>
          <p class="pre">{{ c.body }}</p>
        </article>
      } @empty {
        <p class="muted">No replies yet.</p>
      }

      <form class="card" (submit)="reply($event)">
        <textarea rows="4" required placeholder="Write a reply" [value]="draft()" (input)="draft.set(value($event))"></textarea>
        <div class="row between">
          @if (auth.isAgent()) {
            <label class="inline"><input type="checkbox" [checked]="internal()" (change)="internal.set(checked($event))" /> Internal note (hidden from customer)</label>
          } @else { <span></span> }
          <button type="submit" [disabled]="busy() || !draft().trim()">Send</button>
        </div>
      </form>
    } @else if (!loading()) {
      <!-- RLS makes "not yours" and "doesn't exist" look the same, which avoids leaking that a ticket exists. -->
      <p>Ticket not found.</p>
    }
  `,
})
export class TicketDetailPage implements OnInit, OnDestroy {
  /** Bound from the :id route parameter (withComponentInputBinding). */
  readonly id = input.required<string>();

  readonly auth = inject(AuthService);
  private readonly tickets = inject(TicketService);

  readonly statuses = STATUSES;
  readonly ticket = signal<Ticket | null>(null);
  readonly comments = signal<TicketComment[]>([]);
  readonly draft = signal('');
  readonly internal = signal(false);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');

  private unsubscribe?: () => void;

  async ngOnInit(): Promise<void> {
    const id = Number(this.id());
    try {
      this.ticket.set(await this.tickets.get(id));
      if (this.ticket()) {
        await this.loadComments();
        this.unsubscribe = this.tickets.watchComments(id, () => void this.loadComments());
      }
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  value(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  async changeStatus(event: Event): Promise<void> {
    const status = (event.target as HTMLSelectElement).value as TicketStatus;
    const ticket = this.ticket();
    if (!ticket) return;
    try {
      await this.tickets.setStatus(ticket.id, status);
      this.ticket.set({ ...ticket, status });
    } catch (err) {
      this.error.set((err as Error).message);
    }
  }

  async reply(event: Event): Promise<void> {
    event.preventDefault();
    const ticket = this.ticket();
    if (!ticket) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.tickets.addComment(ticket.id, this.draft().trim(), this.internal());
      this.draft.set('');
      this.internal.set(false);
      await this.loadComments(); // Realtime will also fire; reloading here keeps the sender's view instant.
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  private async loadComments(): Promise<void> {
    const ticket = this.ticket();
    if (ticket) {
      this.comments.set(await this.tickets.comments(ticket.id));
    }
  }
}
