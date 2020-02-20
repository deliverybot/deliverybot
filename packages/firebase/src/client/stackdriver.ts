import StackdriverErrorReporter from "stackdriver-errors-js";

if ((window as any).config.stackdriver) {
  const errorHandler = new StackdriverErrorReporter();
  errorHandler.start((window as any).config.stackdriver);
}
