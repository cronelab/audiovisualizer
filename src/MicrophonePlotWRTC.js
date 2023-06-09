import React, { useRef, useEffect, useState } from "react";
import { WebglPlot, WebglStep, ColorRGBA } from "webgl-plot";
import "./MicrophonePlot.css";
import { TextGrid } from "textgrid";

function parseTextGrid(textgridContent) {
  const lines = textgridContent.split("\n");
  let parsedData = {
    fileType: "",
    objectClass: "",
    xmin: null,
    xmax: null,
    tiers: { exists: false },
    size: 0,
    items: [],
  };
  let currentItem = null;
  let currentInterval = null;

  lines.forEach((line) => {
    line = line.trim();

    // Parse file type and object class
    if (line.startsWith("File type")) {
      parsedData.fileType = line.split("=")[1].trim().replace(/"/g, "");
    } else if (line.startsWith("Object class")) {
      parsedData.objectClass = line.split("=")[1].trim().replace(/"/g, "");
    }
    // Parse xmin and xmax
    else if (line.startsWith("xmin") && !currentItem) {
      parsedData.xmin = parseFloat(line.split("=")[1].trim());
    } else if (line.startsWith("xmax") && !currentItem) {
      parsedData.xmax = parseFloat(line.split("=")[1].trim());
    }
    // Parse tiers
    else if (line.startsWith("tiers?")) {
      parsedData.tiers.exists = line.includes("<exists>");
    } else if (line.startsWith("size =")) {
      parsedData.size = parseInt(line.split("=")[1].trim());
    }
    // Parse item details
    else if (line.startsWith("item [")) {
      if (currentItem) {
        parsedData.items.push(currentItem);
      }
      currentItem = {};
    } else if (currentItem && line.startsWith("class")) {
      currentItem.class = line.split("=")[1].trim().replace(/"/g, "");
    } else if (currentItem && line.startsWith("name")) {
      currentItem.name = line.split("=")[1].trim().replace(/"/g, "");
    } else if (currentItem && line.startsWith("intervals: size")) {
      currentItem.intervals = [];
    } else if (currentItem && line.startsWith("intervals [")) {
      currentInterval = {};
    } else if (currentInterval && line.startsWith("xmin")) {
      currentInterval.xmin = parseFloat(line.split("=")[1].trim());
    } else if (currentInterval && line.startsWith("xmax")) {
      currentInterval.xmax = parseFloat(line.split("=")[1].trim());
    } else if (currentInterval && line.startsWith("text")) {
      currentInterval.text = line.split("=")[1].trim().replace(/"/g, "");
      currentItem.intervals.push(currentInterval);
    }
  });

  // Append the final item
  if (currentItem) {
    parsedData.items.push(currentItem);
  }

  return parsedData;
}

const MicrophonePlotRTC = () => {
  const canvasRef = useRef(null);
  const envelopeCanvasRef = useRef(null);
  const markerRef = useRef(null);
  const envelopeMarkerRef = useRef(null);
  const sliderValueRef = useRef(0);
  const peerConnection = useRef();
  const dataChannel = useRef();
  const signalingServer = useRef();
  const wavDataRef = useRef();
  const wavEnvelopeRef = useRef();
  const [phonemes, setPhonemes] = useState([{}]);

  const bufferSize = 256;
  const sampleRate = 16000;
  const width = window.innerWidth;
  const numPoints = 96000;
  const secondsPadding = 2;

  const word = "Nurse";

  useEffect(() => {
    const canvas = canvasRef.current;
    const envelopeCanvas = envelopeCanvasRef.current;

    // Function to load and process the .wav file
    const loadWavFile = async () => {
      try {
        const textgridModule = await import(`./word_labels/${word}.TextGrid`);
        const textgridFile = textgridModule.default;
        fetch(textgridFile)
          .then((response) => {
            return response.text();
          })
          .then((response) => {
            var textGridObj = parseTextGrid(response);

            textGridObj["items"] = textGridObj["items"].slice(1);

            setPhonemes(textGridObj["items"][1]["intervals"]);
          });

        const wavModule = await import(`./words/${word}.wav`);
        const wavFile = wavModule.default;
        fetch(wavFile)
          .then((response) => response.arrayBuffer())
          .then((arrayBuffer) => {
            // Decode the .wav file
            const audioContext = new AudioContext({ sampleRate: sampleRate });
            audioContext.decodeAudioData(arrayBuffer, (audioBuffer) => {
              wavDataRef.current = audioBuffer.getChannelData(0);

              console.log(wavDataRef.current.length);

              // Superimpose wav data if available
              if (wavDataRef.current) {
                console.log("In Here");
                const paddingSamples = secondsPadding * sampleRate; // 2 seconds padding in samples
                for (
                  let i = 0;
                  i < paddingSamples + wavDataRef.current.length;
                  i++
                ) {
                  if (i < paddingSamples) {
                    wavLine.setY(i, 0); // set the padding as zeros
                  } else {
                    const wavSampleIndex =
                      (i - paddingSamples) % wavDataRef.current.length;
                    const wavSample = wavDataRef.current[wavSampleIndex];
                    wavLine.setY(i, wavSample); // superimpose actual wav data after padding
                  }
                }
              }
            });
          });

        const wavEnvelopeModule = await import(
          `./word_envelopes/${word}_Envelope.wav`
        );
        const wavEnvelopeFile = wavEnvelopeModule.default;
        fetch(wavEnvelopeFile)
          .then((response) => response.arrayBuffer())
          .then((arrayBuffer) => {
            // Decode the .wav file
            const audioContext = new AudioContext({ sampleRate: sampleRate });
            audioContext.decodeAudioData(arrayBuffer, (audioBuffer) => {
              wavEnvelopeRef.current = audioBuffer.getChannelData(0);

              console.log(wavEnvelopeRef.current.length);

              // Superimpose wav data if available
              if (wavEnvelopeRef.current) {
                console.log("In Here");
                const paddingSamples = secondsPadding * sampleRate; // 2 seconds padding in samples
                for (
                  let i = 0;
                  i < paddingSamples + wavEnvelopeRef.current.length;
                  i++
                ) {
                  if (i < paddingSamples) {
                    envelopeWavLine.setY(i, 0); // set the padding as zeros
                  } else {
                    const wavSampleIndex =
                      (i - paddingSamples) % wavEnvelopeRef.current.length;
                    const wavSample = wavEnvelopeRef.current[wavSampleIndex];
                    envelopeWavLine.setY(i, wavSample); // superimpose actual wav data after padding
                  }
                }
              }
            });
          });

        // console.log(wavDataRef.current);
      } catch (error) {
        console.error("Failed to load .wav file", error);
      }
    };

    // Call the loadWavFile function
    loadWavFile();

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * devicePixelRatio;
    canvas.height = 400 * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = "400px";

    envelopeCanvas.width = width * devicePixelRatio;
    envelopeCanvas.height = 400 * devicePixelRatio;
    envelopeCanvas.style.width = `${width}px`;
    envelopeCanvas.style.height = "400px";

    const webglp = new WebglPlot(canvas);
    const line = new WebglStep(new ColorRGBA(0.1, 0.1, 0.1, 1), numPoints);
    webglp.addLine(line);

    line.lineSpaceX(-1, 2 / numPoints);

    const envelopeWebglp = new WebglPlot(envelopeCanvas);
    const envelopeLine = new WebglStep(
      new ColorRGBA(0.1, 0.1, 0.1, 1),
      numPoints
    );
    envelopeWebglp.addLine(envelopeLine);
    envelopeLine.lineSpaceX(-1, 2 / numPoints);

    // Create a separate line for WAV data
    const wavLine = new WebglStep(new ColorRGBA(1, 0, 0, 0.5), numPoints);
    webglp.addLine(wavLine);
    wavLine.lineSpaceX(-1, 2 / numPoints);

    // Create a separate line for WAV data
    const envelopeWavLine = new WebglStep(
      new ColorRGBA(0, 0, 1, 0.5),
      numPoints
    );
    envelopeWebglp.addLine(envelopeWavLine);
    envelopeWavLine.lineSpaceX(-1, 2 / numPoints);

    let plotData = [];
    let envelopePlotData = [];
    let bufferIndex = 0;

    // WebSocket signaling server
    signalingServer.current = new WebSocket("ws://10.17.145.76:3000");

    // Initialize the peer connection
    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.stunprotocol.org" }],
    });

    // Handling messages from signaling server
    signalingServer.current.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.addEventListener("loadend", async () => {
          const text = reader.result;
          try {
            const data = JSON.parse(text);
            await processSignalingData(data);
          } catch (error) {
            console.error("Failed to parse JSON", error);
          }
        });
        reader.readAsText(event.data);
      }
    };

    // Set up the data channel event
    peerConnection.current.ondatachannel = (event) => {
      dataChannel.current = event.channel;
      dataChannel.current.binaryType = "arraybuffer";
      dataChannel.current.onmessage = (event) => {
        const data = new DataView(event.data);
        const start = 0;
        const verPadExt = start + 1;
        const markPay = verPadExt + 1;
        const seqNum = markPay + 2;
        const timestamp = seqNum + 4;
        const ssrc = timestamp + 4;

        const audioStart = ssrc;
        const audioEnd = audioStart + 320;
        const envelopeEnd = audioEnd + 320;

        for (let i = markPay; i < seqNum; i += 2) {
          // console.log(data.getUint16(i, true));
        }
        for (let i = seqNum; i < timestamp; i += 4) {
          // console.log(data.getUint32(i, true));
        }

        for (let i = audioStart; i < audioEnd; i += 2) {
          plotData.push(data.getInt16(i, true));
        }
        for (let i = audioEnd; i < envelopeEnd; i += 2) {
          envelopePlotData.push(data.getInt16(i, true));
        }
      };
    };

    let lastTimestamp = null;
    // const sampleRate = 16000; // 16KHz

    // Render loop
    const animate = (timestamp) => {
      if (canvasRef.current && envelopeCanvasRef.current) {
        if (lastTimestamp) {
          const elapsedTime = (timestamp - lastTimestamp) / 1000;
          const samplesToPlot = Math.floor(elapsedTime * sampleRate);

          for (let i = 0; i < samplesToPlot && i < plotData.length; i++) {
            line.setY(bufferIndex, plotData[i] / 32768);
            envelopeLine.setY(bufferIndex, envelopePlotData[i] / 32768);
            bufferIndex = (bufferIndex + 1) % numPoints;
          }

          plotData = plotData.slice(samplesToPlot);
          envelopePlotData = envelopePlotData.slice(samplesToPlot);

          const markerPosition =
            ((bufferIndex + parseInt(sliderValueRef.current)) % numPoints) *
            (width / numPoints);
          markerRef.current.style.left = `${markerPosition}px`;
          envelopeMarkerRef.current.style.left = `${markerPosition}px`;

          webglp.update();
          envelopeWebglp.update();
        }
        lastTimestamp = timestamp;
        requestAnimationFrame(animate);
      }
    };

    // // Superimpose wav data if available
    // if (wavDataRef.current) {
    //   for (let i = 0; i < wavDataRef.current.length; i++) {
    //     const wavSampleIndex = (bufferIndex + i) % wavDataRef.current.length;
    //     const wavSample = wavDataRef.current[wavSampleIndex];
    //     wavLine.setY(bufferIndex + i, wavSample); // superimpose
    //   }
    // }

    requestAnimationFrame(animate);

    return () => {
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (signalingServer.current) {
        signalingServer.current.close();
      }
    };
  }, []);

  const handleSliderChange = (event) => {
    sliderValueRef.current = event.target.value;
  };

  const processSignalingData = async (data) => {
    if (!peerConnection.current) return;

    if (data.type === "offer") {
      await peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(data)
      );
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      signalingServer.current.send(
        JSON.stringify(peerConnection.current.localDescription)
      );
    } else if (data.candidate) {
      peerConnection.current.addIceCandidate(new RTCIceCandidate(data));
    }
  };

  return (
    <>
      {phonemes.map((phoneme, index) => {
        const leftPosition =
          (((secondsPadding + phoneme.xmin) * sampleRate) / numPoints) * width;
        var boxWidth =
          (((phoneme.xmax - phoneme.xmin) * sampleRate) / numPoints) * width;

        console.log("boxWidth");
        console.log(boxWidth);
        return (
          <div
            key={index}
            className="phoneme-box"
            style={{
              position: "absolute",
              left: `${leftPosition}px`,
              width: `${boxWidth}px`,
              height: "100%",
              backgroundColor: "rgba(200, 200, 200, 0.2)",
              border: "0.2px solid grey",
              textAlign: "center",
              // lineHeight: "400px",
              zIndex: "5",
            }}
          >
            {phoneme.text}
          </div>
        );
      })}
      <div className="plot-container">
        {/* Phonemes boxes */}

        {/* <div className="red-rectangle"></div> */}
        <canvas ref={canvasRef} />
        <div className="marker" ref={markerRef}></div>
        {/* <input
          type="range"
          min="0"
          max={Math.round((numPoints - 1) / 10)}
          defaultValue="0"
          onChange={handleSliderChange}
          className="slider"
        /> */}
      </div>

      <div className="plot-container">
        {/* <div className="red-rectangle"></div> */}
        <canvas ref={envelopeCanvasRef} />
        <div className="green-marker" ref={envelopeMarkerRef}></div>
      </div>
    </>
  );
};

export default MicrophonePlotRTC;
