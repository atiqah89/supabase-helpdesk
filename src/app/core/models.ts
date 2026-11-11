// Hand-written to keep the repo readable. In a real project, generate these with
// `npm run db:types` so they can't drift from the schema.

export type Role = 'customer' | 'agent';
export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export const STATUSES: TicketStatus[] = ['open', 'pending', 'resolved', 'closed'];
export const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
}

export interface PersonRef {
  email: string;
  full_name: string | null;
  role?: Role;
}

export interface Ticket {
  id: number;
  subject: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  requester: PersonRef | null;
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  author: PersonRef | null;
}
