class V2Device extends V2Connection {
  #wakeLock = null;

  constructor(app, log, connect) {
    super(app, log, connect);
    Object.seal(this);
  }

  connect(device) {
    if (this.version)
      this.version.remove();

    this.device.disconnect();
    this.app.callSections('reset');

    this.device.input = device.in;
    this.device.output = device.out;
    this.select.setConnected();

    // Dispatch incoming messages to V2MIDIDevice.
    if (this.device.input)
      this.device.input.onmidimessage = this.device.handleMessage.bind(this.device);

    this.app.callSections('show');

    const requestWakeLock = async () => {
      if (!navigator.wakeLock)
        return;

      this.#wakeLock = await navigator.wakeLock.request('screen');
    };

    requestWakeLock();
  }

  disconnect() {
    this.device.disconnect();
    this.select.setDisconnected();

    for (const notifier of this.notifiers.reset)
      notifier();

    if (this.#wakeLock) {
      this.#wakeLock.release();
      this.#wakeLock = null;
    }
  }

  sendReset(mode) {
    this.sendSystemReset();
  }
}
