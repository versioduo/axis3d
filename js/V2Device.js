class V2Device extends V2Connection {
  #wakeLock = null;

  constructor(log, connect) {
    super(log, connect);

    return Object.seal(this);
  }

  connect(device) {
    if (this.version)
      this.version.remove();

    this.device.disconnect();
    for (const notifier of this.notifiers.reset)
      notifier();

    this.device.input = device.in;
    this.device.output = device.out;
    this.select.setConnected();

    // Dispatch incoming messages to V2MIDIDevice.
    if (this.device.input)
      this.device.input.onmidimessage = this.device.handleMessage.bind(this.device);

    for (const notifier of this.notifiers.show)
      notifier();

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
