class V2Main extends V2Device {
  #wakeLock = null;

  constructor(app, log) {
    super(app, log);
    Object.seal(this);

    app.main = this;
    this.addSection();
    this.canvas.appendChild(this.connection.element);

    V2App.addElement(this.canvas, 'p', (e) => {
      e.classList.add('center');
      e.innerHTML = '<a href=' + document.querySelector('link[rel="source"]').href +
        ' target="software">' + document.querySelector('meta[name="name"]').content +
        '</a>, version ' + Number(document.querySelector('meta[name="version"]').content);
    });
  }

  connect(device) {
    this.removeSection();
    this.addSection();
    this.canvas.appendChild(this.connection.element);

    this.device.disconnect();
    this.app.callSections('reset');

    this.device.input = device.in;
    this.device.output = device.out;
    this.connection.select.setConnected();

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
    this.connection.select.setDisconnected();
    this.app.callSections('reset');

    if (this.#wakeLock) {
      this.#wakeLock.release();
      this.#wakeLock = null;
    }
  }

  sendReset(mode) {
    this.sendSystemReset();
  }
}
