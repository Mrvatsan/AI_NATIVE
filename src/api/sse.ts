import { Request, Response } from 'express';

export class ServerEventStreamer {
  private clients: Map<string, Response[]> = new Map();
  private eventHistory: Map<string, any[]> = new Map();

  addClient(jobId: string, req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (!this.clients.has(jobId)) {
      this.clients.set(jobId, []);
    }
    this.clients.get(jobId)!.push(res);

    // Replay previous events for this job
    const history = this.eventHistory.get(jobId) || [];
    for (const event of history) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    req.on('close', () => {
      const jobClients = this.clients.get(jobId) || [];
      this.clients.set(jobId, jobClients.filter(client => client !== res));
    });
  }

  emit(jobId: string, event: any) {
    // Save to history
    if (!this.eventHistory.has(jobId)) {
      this.eventHistory.set(jobId, []);
    }
    this.eventHistory.get(jobId)!.push(event);

    // Broadcast
    const clients = this.clients.get(jobId) || [];
    for (const client of clients) {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
}
