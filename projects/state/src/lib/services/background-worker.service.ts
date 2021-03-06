import { Inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';
import { BehaviorSubject, Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  IServiceWithIndex,
  SERVICE_WITH_INDEX,
} from '../common/service-with-index.model';
import { IWorkerAction, IWorkerMessage, SubScriptionManager } from '../models';
import * as workerActions from '../models/worker-action.model';
import { ProductsWorkerService } from './worker/products-worker.service';

declare const postMessage: (v: any) => {};
declare let onconnect: (e: any) => void;

// chrome://inspect/#workers

@Injectable()
export class BackGroundWorkerService {
  private listnerSubject: BehaviorSubject<IWorkerMessage>;
  private ports: any[] = [];
  private worker: Worker;
  private subs: SubScriptionManager[] = [];

  private isSharedWorker = false;

  constructor(
    private productsService: ProductsWorkerService,
    @Inject(SERVICE_WITH_INDEX) private serviceWithIndex: IServiceWithIndex[],
    private store: Store<any>,
  ) {
    this.listnerSubject = new BehaviorSubject<IWorkerMessage>(undefined);
  }

  public start() {
    console.log('start');
    this.productsService.loadProducts();

    if (typeof onmessage !== 'undefined' && typeof onmessage !== undefined) {
      onmessage = e => {
        if (e.data) {
          const data: workerActions.WorkerActions = e.data;
          this.processMessage(data);
        }
      };
    } else {
      console.warn('Not a web Worker');
    }

    if (typeof onconnect !== 'undefined' && typeof onconnect !== undefined) {
      this.isSharedWorker = true;

      onconnect = c => {
        console.log('portCont', c.ports.length);

        this.ports.push(c.ports[0]);
        c.ports[0].onmessage = e => {
          if (e.data) {
            const data: workerActions.WorkerActions = e.data;
            this.processMessage(data);
          }
        };
      };
    } else {
      console.warn('Not a shared Worker');
    }
  }

  public listen(): Observable<IWorkerMessage> {
    return this.listnerSubject.asObservable();
  }

  public send(message: IWorkerMessage) {
    console.log('Sending Message to Client:', message);
    if (this.ports && this.ports.length) {
      this.ports.forEach(p => p.postMessage(message));
    } else {
      postMessage(message);
    }
  }

  public stop() {
    this.worker.terminate();
    this.worker = undefined;
  }

  private processMessage(data: workerActions.WorkerActions) {
    console.log('Received Message from Client:', data);
    let subScriptionManager: SubScriptionManager;

    switch (data.action) {
      case 'reducer': {
        const d = data as workerActions.ReducerWorkerAction;
        this.store.dispatch(d.payload);
        break;
      }
      case 'listen': {
        const d = data as workerActions.ListenWorkerAction;
        subScriptionManager = new SubScriptionManager(d);
        subScriptionManager.subscription = this.store
          .select(d.reducer)
          .subscribe(x => {
            this.send({
              reducer: subScriptionManager.key,
              payload: x,
            });
          });
        break;
      }
      case 'execute': {
        const d = data as workerActions.ExecuteWorkerAction;
        subScriptionManager = new SubScriptionManager(d);

        this.serviceWithIndex.forEach(s => {
          if (s.methods[d.key]) {
            subScriptionManager.subscription = s.methods[d.key](
              d.args,
            ).subscribe(x => {
              // console.log('execute', subScriptionManager.key, x);
              this.send({
                reducer: subScriptionManager.key,
                payload: x,
              });
            });
          }
        });

        break;
      }
      case 'unsubscribe': {
        if (!this.isSharedWorker) {
          const d = data as workerActions.UnsubscribeWorkerAction;
          let i = this.subs.length;
          while (i--) {
            if (this.subs[i].key === d.key) {
              // console.log('unsub', d);
              this.subs[i].subscription.unsubscribe();
              this.subs.splice(i, 1);
            }
          }
        }
      }
    }

    if (subScriptionManager) {
      this.subs.push(subScriptionManager);
    }
  }
}
