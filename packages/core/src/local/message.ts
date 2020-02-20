export class MessageBus {
  async subscribe(topic: string, user: { id: string }): Promise<any> {}
  async poll(topic: string, user: { id: string }): Promise<void> {}
  async publish(topic: string, message: any): Promise<void> {}
}
