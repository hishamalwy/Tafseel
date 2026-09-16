import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Balance, WithdrawalPolicy } from '../models/earnings';

/**
 * The two reads FIN-01 needs. There is no earnings-history contract in V1 and this ticket does not
 * invent one: the CSV statement and the business analytics are `B11-09`.
 */
export interface EarningsGateway {
  balances(): Observable<readonly Balance[]>;
  policy(): Observable<WithdrawalPolicy>;
}

export const EARNINGS_GATEWAY = new InjectionToken<EarningsGateway>('EarningsGateway');
