import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TicketService } from '../core/tickets';
import { Priority, PRIORITIES } from '../core/models';

@Component({
  selector: 'app-new-ticket',
  template: `
    <section class="card">
      <h1>Open a ticket</h1>
      <form (submit)="submit($event)">
        <label>Subject
          <input required minlength="3" maxlength="200" [value]="subject()" (input)="subject.set(value($event))" />
        </label>
        <label>What's happening?
          <textarea required rows="6" [value]="description()" (input)="description.set(value($event))"
            placeholder="Steps to reproduce, what you expected, what you saw, any error codes"></textarea>
        </label>
        <label>Priority
          <select [value]="priority()" (change)="priority.set($any(value($event)))">
            @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
          </select>
        </label>
        <button type="submit" [disabled]="busy()">{{ busy() ? 'Submitting…' : 'Submit' }}</button>
      </form>
      @if (error()) { <p class="error">{{ error() }}</p> }
    </section>
  `,
})
export class NewTicketPage {
  private readonly tickets = inject(TicketService);
  private readonly router = inject(Router);

  readonly priorities = PRIORITIES;
  readonly subject = signal('');
  readonly description = signal('');
  readonly priority = signal<Priority>('normal');
  readonly busy = signal(false);
  readonly error = signal('');

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.busy.set(true);
    this.error.set('');
    try {
      const ticket = await this.tickets.create({
        subject: this.subject().trim(),
        description: this.description().trim(),
        priority: this.priority(),
      });
      await this.router.navigate(['/tickets', ticket.id]);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
