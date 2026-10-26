import type { Namespace } from 'socket.io';

/** Whether anybody is connected to a room, asked through the adapter so sockets of every instance count. */
export class Presence {
    constructor(private readonly nsp: Namespace) {}

    async isOnline(room: string): Promise<boolean> {
        return (await this.nsp.in(room).fetchSockets()).length > 0;
    }
}
