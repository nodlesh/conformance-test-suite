import BaseRunnableTask from "./baseRunnableTask";

export default class SimpleTask extends BaseRunnableTask {
  constructor(name: string, pd: string, description?: string) {
    super(name, description);
  }

  async prepare(): Promise<void> {
    super.prepare();
  }

  async run(): Promise<void> {
    super.run();
    this.addMessage("waiting for 1 second");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.setCompleted();
    this.setAccepted();
    this.addMessage("done waiting for 1 second");
  }
}
