import { EventEmitter } from 'events';

export class Lock {
  name: string;

  locked: boolean;

  events: EventEmitter;

  constructor(name: string) {
    this.name = name;
    this.locked = false;
    this.events = new EventEmitter();
  }

  acquire() {
    return new Promise((resolve) => {
      // If somebody has the lock, wait until he/she releases the lock and try again
      if (this.locked) {
        const tryAcquire = () => {
          if (!this.locked) {
            this.locked = true;
            this.events.removeListener('release', tryAcquire);
            resolve(true);
          }
        };

        this.events.on('release', tryAcquire);
      } else {
        // Otherwise, take the lock and resolve immediately
        this.locked = true;
        resolve(true);
      }
    });
  }

  release() {
    // Release the lock immediately
    this.locked = false;
    setImmediate(() => this.events.emit('release'));
  }
}

const locks = new Map<string, Lock>();
export function getLock(name: string): Lock {
  const exist = locks.get(name);
  if (exist instanceof Lock) {
    return exist;
  }

  const lock = new Lock(name);
  locks.set(name, lock);

  return lock;
}
