import { Routes } from '@angular/router';
import { authGuard } from './core/auth';
import { LoginPage } from './pages/login';
import { NewTicketPage } from './pages/new-ticket';
import { TicketDetailPage } from './pages/ticket-detail';
import { TicketListPage } from './pages/ticket-list';

export const routes: Routes = [
  { path: 'login', component: LoginPage },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', component: TicketListPage },
      { path: 'tickets/new', component: NewTicketPage },
      { path: 'tickets/:id', component: TicketDetailPage },
    ],
  },
  { path: '**', redirectTo: '' },
];
