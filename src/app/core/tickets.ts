import { inject, Injectable } from '@angular/core';
import { SupabaseService, unwrap } from './supabase';
import { Priority, Ticket, TicketComment, TicketStatus } from './models';

// tickets has two foreign keys to profiles (created_by and assigned_to), so an embed must name
// the one it means. Writing just `profiles(...)` fails with PGRST201 "more than one relationship".
const TICKET_FIELDS =
  'id, subject, description, priority, status, created_by, created_at, updated_at, ' +
  'requester:profiles!tickets_created_by_fkey(email, full_name)';

const COMMENT_FIELDS =
  'id, ticket_id, author_id, body, is_internal, created_at, ' +
  'author:profiles!ticket_comments_author_id_fkey(email, full_name, role)';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly supabase = inject(SupabaseService).client;

  /** RLS does the filtering: customers get their own tickets, agents get everything. */
  async list(status: TicketStatus | 'all'): Promise<Ticket[]> {
    let query = this.supabase.from('tickets').select(TICKET_FIELDS).order('updated_at', { ascending: false }).limit(100);
    if (status !== 'all') {
      query = query.eq('status', status);
    }
    return unwrap(await query) as unknown as Ticket[];
  }

  /** Returns null when the ticket doesn't exist OR RLS hides it; the API can't tell them apart (by design). */
  async get(id: number): Promise<Ticket | null> {
    return unwrap(await this.supabase.from('tickets').select(TICKET_FIELDS).eq('id', id).maybeSingle()) as unknown as Ticket | null;
  }

  async create(input: { subject: string; description: string; priority: Priority }): Promise<Ticket> {
    // created_by is filled in by the column default (auth.uid()), and RLS checks it.
    return unwrap(await this.supabase.from('tickets').insert(input).select(TICKET_FIELDS).single()) as unknown as Ticket;
  }

  async setStatus(id: number, status: TicketStatus): Promise<void> {
    // .select() makes a silent RLS no-op visible: without it, an update that touches zero rows "succeeds".
    const rows = unwrap(await this.supabase.from('tickets').update({ status }).eq('id', id).select('id')) as { id: number }[];
    if (rows.length === 0) {
      throw new Error('Ticket not updated. Only agents can change the status.');
    }
  }

  async comments(ticketId: number): Promise<TicketComment[]> {
    return unwrap(
      await this.supabase.from('ticket_comments').select(COMMENT_FIELDS).eq('ticket_id', ticketId).order('created_at'),
    ) as unknown as TicketComment[];
  }

  async addComment(ticketId: number, body: string, isInternal: boolean): Promise<void> {
    unwrap(await this.supabase.from('ticket_comments').insert({ ticket_id: ticketId, body, is_internal: isInternal }));
  }

  /**
   * Calls `onChange` when a comment is added to this ticket. Realtime applies the same RLS
   * policies, so customers are never sent internal notes.
   * @returns a function that unsubscribes
   */
  watchComments(ticketId: number, onChange: () => void): () => void {
    const channel = this.supabase
      .channel(`ticket-${ticketId}-comments`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${ticketId}` },
        () => onChange(),
      )
      .subscribe();
    return () => void this.supabase.removeChannel(channel);
  }
}
