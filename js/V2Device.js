// © Kay Sievers <kay@versioduo.com>, 2019-2022
// SPDX-License-Identifier: Apache-2.0

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

    // Detach the Log section and attach it again after all other sections.
    this.log.detach();

    for (const notifier of this.notifiers.show)
      notifier();

    this.log.attach();

    const requestWakeLock = async () => {
      if (!navigator.wakeLock)
        return;

      this.#wakeLock = await navigator.wakeLock.request('screen');
    }

    requestWakeLock();
  }

  disconnect() {
    this.device.disconnect();
    this.select.setDisconnected();

    for (const notifier of this.notifiers.reset)
      notifier();

    this.log.detach();

    if (this.#wakeLock) {
      this.#wakeLock.release();
      this.#wakeLock = null;
    }
  }
}
