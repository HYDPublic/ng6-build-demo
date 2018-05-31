import { Injectable } from '@angular/core';
import { Action } from '@ngrx/store';
import { BehaviorSubject, Observable } from 'rxjs';
import { WorkerService } from './client/worker.service';

@Injectable({
  providedIn: 'root',
})
export class StateProxyService {
  private subs: { [id: string]: BehaviorSubject<any> } = {};

  constructor(private workerService: WorkerService) {
    this.workerService.listen().subscribe(x => {
      console.log('StateProxyService', x);
      if (x !== undefined && this.subs[x.reducer] !== undefined) {
        this.subs[x.reducer].next(x.payload);
      }
    });
  }

  public select<K = any>(path: string): Observable<K> {
    if (this.subs[path] === undefined) {
      this.subs[path] = new BehaviorSubject<K>(undefined);
    }

    this.workerService.send({
      action: 'listen',
      payload: path,
    });

    return this.subs[path].asObservable();
  }

  public dispatch<V extends Action = Action>(action: V): void {
    this.workerService.send({
      action: 'reducer',
      payload: action,
    });
  }

  public execute<T>(method: string, ...args: any[]): Observable<T> {
    if (this.subs[method] === undefined) {
      this.subs[method] = new BehaviorSubject<T>(undefined);
    }

    this.workerService.send({
      action: 'execute',
      key: method,
      payload: args,
    });

    return this.subs[method].asObservable();
  }

  // return this.stateProxyService.execute<IProduct>(
  //   'ProductService.getProductByCode',
  //   code,
  // );
}
