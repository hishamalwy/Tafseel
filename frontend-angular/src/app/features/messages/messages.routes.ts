import { Routes } from '@angular/router';
import { MessagesGateway } from './services/messages.gateway';
import { MessagesRealtime } from './services/messages-realtime.service';

/** The inbox and a conversation (J9-02). The API and the hub check participation on every call. */
export const MESSAGES_ROUTES: Routes = [{
  path: '',
  providers: [MessagesGateway, MessagesRealtime],
  loadComponent: () => import('./pages/messages-page.component').then(m => m.MessagesPageComponent)
}];
