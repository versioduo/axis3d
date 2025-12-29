class V2Axis extends V2WebModule {
  #device = null;
  #notify = null;
  #element = null;
  #cc = Object.seal({
    w: null,
    x: null,
    y: null,
    z: null
  });
  #invert = null;
  #quat = null;
  #update = null;

  constructor(device) {
    super('axis', 'Axis', 'Turn object with MIDI orientation data');
    this.#device = device;

    this.#device.addNotifier('show', () => {
      this.#show();
      this.attach();
    });

    this.#device.addNotifier('reset', () => {
      this.detach();
      this.reset();
    });

    this.#device.getDevice().addNotifier('controlChange', (channel, controller, value) => {
      switch (controller) {
        case V2MIDI.CC.generalPurpose1 + 0:
          this.#cc.w = value;
          break;

        case V2MIDI.CC.generalPurpose1 + 1:
          this.#cc.x = value;
          break;

        case V2MIDI.CC.generalPurpose1 + 2:
          this.#cc.y = value;
          break;

        case V2MIDI.CC.generalPurpose1 + 3:
          this.#cc.z = value;
          break;

        case V2MIDI.CC.generalPurpose1LSB + 0: {
          if (this.#cc.w === null)
            break;

          const v = (this.#cc.w << 7) | value;
          this.#quat[3] = (v / 16383 * 2) - 1;
          this.#update();
          break;
        }

        case V2MIDI.CC.generalPurpose1LSB + 1: {
          if (this.#cc.x === null)
            break;

          const v = (this.#cc.x << 7) | value;
          this.#quat[0] = (v / 16383 * 2) - 1;
          this.#update();
          break;
        }

        case V2MIDI.CC.generalPurpose1LSB + 2: {
          if (this.#cc.y === null)
            break;

          const v = (this.#cc.y << 7) | value;
          this.#quat[1] = (v / 16383 * 2) - 1;
          this.#update();
          break;
        }

        case V2MIDI.CC.generalPurpose1LSB + 3: {
          if (this.#cc.z === null)
            break;

          const v = (this.#cc.z << 7) | value;
          this.#quat[2] = (v / 16383 * 2) - 1;
          this.#update();
          break;
        }
      }
    });

    return Object.seal(this);
  }

  #show() {
    this.#notify = new V2WebNotify(this.canvas);

    new V2WebField(this.canvas, (field) => {
      V2Web.addButtons(this.canvas, (buttons) => {
        V2Web.addButton(buttons, (e) => {
          e.textContent = 'Reset';
          e.addEventListener('click', () => {
            this.#device.sendSystemReset();
            this.#quat = glMatrix.quat.create();
            this.#update();
          });
        });

        V2Web.addButton(buttons, (e) => {
          e.textContent = 'Home';
          e.addEventListener('click', () => {
            this.#device.sendControlChange(0, V2MIDI.CC.controller14, 0);
          });
        });

        V2Web.addButton(buttons, (e) => {
          e.textContent = 'Save';
          e.addEventListener('click', () => {
            this.#device.sendControlChange(0, V2MIDI.CC.controller15, 0);
          });
        });
      });
    });

    V2Web.addElement(this.canvas, 'canvas', (e) => {
      this.#element = e;
      e.classList.add('mb-4');
      e.width = e.height = 1024;
      e.style.width = '100%';
    });

    new V2WebField(this.canvas, (field) => {
      field.addButton((e) => {
        e.classList.add('width-text');
        e.classList.add('has-background-light');
        e.classList.add('inactive');
        e.textContent = 'Invert';
        e.tabIndex = -1;
      });

      field.addElement('label', (label) => {
        label.classList.add('switch');

        V2Web.addElement(label, 'input', (e) => {
          this.#invert = e;
          e.type = 'checkbox';

          e.addEventListener('change', () => {
            this.#update();
          });
        });

        V2Web.addElement(label, 'span', (e) => {
          e.classList.add('check');
        });
      });
    });

    this.#cc.w = this.#cc.x = this.#cc.y = this.#cc.z = null;
    this.#quat = glMatrix.quat.create();

    const loadShader = (gl, type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        this.#notify.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        this.#device.print('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }

      return shader;
    };

    const initShaderProgram = (gl, vsSource, fsSource) => {
      const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
      const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

      const shaderProgram = gl.createProgram();
      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);
      if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        this.#notify.error('Error initializing the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        this.#device.print('Error initializing the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
      }

      return shaderProgram;
    };

    const initBuffers = (gl) => {
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

      // Front, back, top, bottom, right, left,
      const faces = [
        -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
        -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, -1.0,
        -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0,
        -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0,
        1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0,
        -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0,
      ];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(faces), gl.STATIC_DRAW);

      const faceColours = [
        [1.0, 0.0, 0.0, 1.0],
        [1.0, 0.0, 1.0, 1.0],
        [0.0, 1.0, 1.0, 1.0],
        [0.0, 0.0, 1.0, 1.0],
        [0.0, 1.0, 0.0, 1.0],
        [1.0, 1.0, 0.0, 1.0],
      ];

      let colours = [];
      for (const c of faceColours)
        colours = colours.concat(c, c, c, c);

      const colourBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, colourBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colours), gl.STATIC_DRAW);
      const indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

      const indices = [
        0, 1, 2, 0, 2, 3,
        4, 5, 6, 4, 6, 7,
        8, 9, 10, 8, 10, 11,
        12, 13, 14, 12, 14, 15,
        16, 17, 18, 16, 18, 19,
        20, 21, 22, 20, 22, 23,
      ];

      gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(indices),
        gl.STATIC_DRAW
      );

      return {
        position: positionBuffer,
        colour: colourBuffer,
        indices: indexBuffer,
      };
    };

    const drawScene = (gl, programInfo, buffers) => {
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clearDepth(1.0);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      {
        const numComponents = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.vertexAttribPointer(
          programInfo.attribLocations.vertexPosition,
          numComponents,
          type,
          normalize,
          stride,
          offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
      }

      {
        const numComponents = 4;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.colour);
        gl.vertexAttribPointer(
          programInfo.attribLocations.vertexColour,
          numComponents,
          type,
          normalize,
          stride,
          offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexColour);
      }

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
      gl.useProgram(programInfo.program);

      {
        const fieldOfView = (45 * Math.PI) / 180;
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const zNear = 0.1;
        const zFar = 100.0;
        const projectionMatrix = glMatrix.mat4.create();
        glMatrix.mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

        gl.uniformMatrix4fv(
          programInfo.uniformLocations.projectionMatrix,
          false,
          projectionMatrix
        );
      }

      {
        const modelViewMatrix = glMatrix.mat4.create();
        glMatrix.mat4.translate(
          modelViewMatrix,
          modelViewMatrix,
          [-0.0, 0.0, -5.0]
        );

        // Decode quaternion to vector and angle, and rotate the cube.
        const orientation = glMatrix.vec3.create();
        let angle;

        if (this.#invert.checked) {
          let q = glMatrix.quat.clone(this.#quat);
          glMatrix.quat.conjugate(q, q);
          angle = glMatrix.quat.getAxisAngle(orientation, q);

        } else
          angle = glMatrix.quat.getAxisAngle(orientation, this.#quat);

        // Map ENU to GL:
        // X (right)             <-  X (east)
        // Y (up)                <-  Z (up)
        // Z (depth, +to viewer) <- -Y (north)
        [orientation[1], orientation[2]] = [orientation[2], -orientation[1]];

        glMatrix.mat4.rotate(
          modelViewMatrix,
          modelViewMatrix,
          angle,
          orientation
        );

        gl.uniformMatrix4fv(
          programInfo.uniformLocations.modelViewMatrix,
          false,
          modelViewMatrix
        );
      }

      {
        const vertexCount = 36;
        const type = gl.UNSIGNED_SHORT;
        const offset = 0;
        gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
      }
    };

    // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Creating_3D_objects_using_WebGL
    const gl = this.#element.getContext("webgl") || this.#element.getContext("experimental-webgl");
    if (!gl) {
      this.#notify.error("WebGL is not supported");
      this.#device.print("WebGL is not supported");
      return;
    }

    const vertexSource = `
      attribute vec4 aVertexPosition;
      attribute vec4 aVertexColour;

      uniform mat4 uModelViewMatrix;
      uniform mat4 uProjectionMatrix;

      varying lowp vec4 vColour;

      void main(void) {
        gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
        vColour = aVertexColour;
      }
    `;

    const fragmentSource = `
      varying lowp vec4 vColour;

      void main(void) {
        gl_FragColor = vColour;
      }
    `;

    const shaderProgram = initShaderProgram(gl, vertexSource, fragmentSource);
    const programInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
        vertexColour: gl.getAttribLocation(shaderProgram, "aVertexColour"),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(
          shaderProgram,
          "uProjectionMatrix"
        ),
        modelViewMatrix: gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
      },
    };

    const buffers = initBuffers(gl);

    this.#update = () => {
      requestAnimationFrame((now) => {
        drawScene(gl, programInfo, buffers);
      });
    };

    this.#device.sendControlChange(0, V2MIDI.CC.allNotesOff, 0);
    this.#update();
  }

  #reset() {
    while (this.#element.firstChild)
      this.#element.firstChild.remove();
  }
}
