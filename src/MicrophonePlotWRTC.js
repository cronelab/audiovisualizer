import React, { useRef, useEffect, useState } from "react";
import { WebglPlot, WebglStep, ColorRGBA } from "webgl-plot";
import "./MicrophonePlot.css";
import { TextGrid } from "textgrid";
import config from "./configs/audiovisualizerConfig";

// Curried function that will accumulate the values of whatever iterable it is passed.
const accumulate = (arr) =>
  arr.map(
    (
      (sum) => (value) =>
        (sum += value)
    )(0)
  );

function generateRandomUniform(min, max) {
  return Math.random() * (max - min) + min;
}

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
  const currentWordIdxRef = useRef(0);
  const startTimes = useRef([0]);
  const trialStartTimestamp = useRef(null);
  const initializeTrial = useRef(false);
  const trialEndTimestamp = useRef(null);
  const timeStampValueGlobal = useRef(null);
  const [phonemes, setPhonemes] = useState([{}]);
  const [currentWord, setCurrentWord] = useState("");
  const [isStarted, setIsStarted] = useState(false);

  const bufferSize = 256;
  const sampleRate = 16000;
  const width = window.innerWidth;
  const numPoints = 80000;
  const secondsPadding = 2;
  const windowWidth = 5; // Seconds

  const initialFlag = useRef(false);

  const word = "Nurse";

  const handleStartButtonClick = () => {
    setIsStarted(true);
  };

  useEffect(() => {
    if (!isStarted) {
      return;
    }

    console.log("Is Started");
    console.log(isStarted);

    const canvas = canvasRef.current;
    const envelopeCanvas = envelopeCanvasRef.current;

    let audioQueueNAVI = [];
    let audioQueueInference = [];

    let trialLength = config.TRIAL_CONFIG.block1.length;
    let TICKS_PER_SECOND = config.TICKS_PER_SECOND;

    startTimes.current = Array.from({ length: trialLength }, () =>
      generateRandomUniform(
        config.PRE_WORD_INTERVAL - config.VARIANCE,
        config.PRE_WORD_INTERVAL + config.VARIANCE
      )
    );

    let endTimes = Array.from({ length: trialLength }, () =>
      generateRandomUniform(
        config.POST_WORD_INTERVAL - config.VARIANCE,
        config.POST_WORD_INTERVAL + config.VARIANCE
      )
    );

    let words = Object.values(config.WORD_CODE);
    let durations = {};
    const audioContext = new AudioContext({ sampleRate: sampleRate });

    let trialWords = config.TRIAL_CONFIG.block1.map(
      (trialIndex) => config.WORD_CODE[trialIndex]
    );

    let promises = words.reduce((acc, element) => {
      let promise = import(`./words/${element}.wav`)
        .then((wavModule) => {
          const wavFile = wavModule.default;
          return fetch(wavFile);
        })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.arrayBuffer();
        })
        .then((arrayBuffer) => {
          return new Promise((resolve, reject) => {
            audioContext.decodeAudioData(arrayBuffer, resolve, reject);
          });
        })
        .then((audioBuffer) => {
          durations[element] = audioBuffer.duration;
        })
        .catch((e) => console.log("There was an error: " + e.message));

      return acc.concat(promise);
    }, []);

    // Get all of the trial durations, including the start and end times.
    let trialDurations;
    // let trialDurations = startTimes.map(
    //   (time, idx) =>
    //     time * TICKS_PER_SECOND +
    //     durations[trialWords[idx]] * TICKS_PER_SECOND +
    //     endTimes[idx] * TICKS_PER_SECOND
    // );

    // console.log("Trial Durations One");
    // console.log(trialDurations);

    // WebSocket signaling server
    console.log("Signaling Server Initialized");
    signalingServer.current = new WebSocket("ws://10.17.145.76:3000");

    // Wait for the connection to be established before trying to send any data
    // signalingServer.current.onopen = (event) => {
    //   console.log("Connection with signaling server established");

    //   Promise.all(promises).then(() => {
    //     console.log("Resolved Promises");
    //     console.log(durations);

    //     // Prepare the data to be sent
    //     const dataToSend = {
    //       type: "durations",
    //       content: durations,
    //     };

    //     // Convert the data to a JSON string
    //     const dataString = JSON.stringify(dataToSend);

    //     // Send the data to the signaling server
    //     signalingServer.current.send(dataString);
    //   });
    // };

    // Promise.all(promises).then(() => {
    //   console.log("Resolved Promises");
    //   console.log(durations);
    // });

    // Function to load and process the .wav file
    const loadWavFile = async (word, startTimeSeconds, endTimeSeconds) => {
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
            setCurrentWord(word);
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

              // console.log(wavDataRef.current.length);

              // Superimpose wav data if available
              if (wavDataRef.current) {
                // console.log("In Here");
                const paddingSamples = Math.floor(
                  startTimeSeconds * sampleRate
                ); // 2 seconds padding in samples
                const paddingSamplesEnd = Math.floor(
                  endTimeSeconds * sampleRate
                );
                for (
                  let i = 0;
                  i <
                  paddingSamples +
                    wavDataRef.current.length +
                    paddingSamplesEnd;
                  i++
                ) {
                  if (i < paddingSamples) {
                    wavLine.setY(i, 0); // set the padding as zeros
                  } else if (i >= paddingSamples + wavDataRef.current.length) {
                    wavLine.setY(i, 0);
                  } else {
                    const wavSampleIndex = i - paddingSamples;
                    // console.log("wavSampleIndex");
                    // console.log(wavSampleIndex);
                    // (i - paddingSamples) % wavDataRef.current.length;
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

              // console.log("Wav Envelope Ref");
              // console.log(wavEnvelopeRef.current.length);

              // Superimpose wav data if available
              if (wavEnvelopeRef.current) {
                // console.log("In Here");
                const paddingSamples = Math.floor(
                  startTimeSeconds * sampleRate
                ); // 2 seconds padding in samples
                const paddingSamplesEnd = Math.floor(
                  endTimeSeconds * sampleRate
                );
                for (
                  let i = 0;
                  i <
                  paddingSamples +
                    wavEnvelopeRef.current.length +
                    paddingSamplesEnd;
                  i++
                ) {
                  if (i < paddingSamples) {
                    envelopeWavLine.setY(i, 0); // set the padding as zeros
                  } else if (
                    i >=
                    paddingSamples + wavEnvelopeRef.current.length
                  ) {
                    envelopeWavLine.setY(i, 0);
                  } else {
                    const wavSampleIndex = i - paddingSamples;
                    // (i - paddingSamples) % wavEnvelopeRef.current.length;
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
    // loadWavFile("Nurse");

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
    const line = new WebglStep(
      new ColorRGBA(0.118, 0, 1, 0.7),
      windowWidth * sampleRate
    );
    webglp.addLine(line);

    line.lineSpaceX(-1, 2 / (windowWidth * sampleRate));

    const envelopeWebglp = new WebglPlot(envelopeCanvas);
    const envelopeLine = new WebglStep(
      new ColorRGBA(0.118, 0, 1, 0.9),
      windowWidth * sampleRate
    );
    envelopeWebglp.addLine(envelopeLine);
    envelopeLine.lineSpaceX(-1, 2 / (windowWidth * sampleRate));

    // Create a separate line for WAV data
    const wavLine = new WebglStep(new ColorRGBA(0.1, 0.1, 0.1, 0.8), numPoints);
    webglp.addLine(wavLine);
    wavLine.lineSpaceX(-1, 2 / numPoints);

    // Create a separate line for WAV data
    const envelopeWavLine = new WebglStep(
      new ColorRGBA(0.1, 0.1, 0.1, 0.8),
      numPoints
    );
    envelopeWebglp.addLine(envelopeWavLine);
    envelopeWavLine.lineSpaceX(-1, 2 / numPoints);

    for (let i = 0; i < numPoints; i++) {
      line.setY(i, 0);
      envelopeLine.setY(i, 0);
      wavLine.setY(i, 0);
      envelopeWavLine.setY(i, 0);
      // bufferIndex = (bufferIndex + 1) % numPoints;
    }

    let plotData = [];
    let plotTimestamps = [];
    let envelopePlotData = [];
    let bufferIndex = 0;

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

    // let timeStampValue

    // Set up the data channel event
    peerConnection.current.ondatachannel = (event) => {
      dataChannel.current = event.channel;
      dataChannel.current.binaryType = "arraybuffer";

      let timeStampValue = null;
      let startTimeStampValue = null;
      let plotDataValue = null;
      let plotEnvelopeValue = null;

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

        let timeStampArray = [];
        for (let i = seqNum; i < timestamp; i += 4) {
          // console.log(data.getUint32(i, true));
          let curTimeStampValue = data.getUint32(i, true);
          timeStampValueGlobal.current = curTimeStampValue;

          if (
            trialStartTimestamp.current &&
            curTimeStampValue >= trialStartTimestamp.current
          ) {
            console.log("Here");
            initializeTrial.current = true;

            // startTimeStampValue = curTimeStampValue;
          }

          // if (!timeStampValue) {

          // console.log("startTimeStamp");
          // console.log(startTimeStampValue);

          // console.log("TimeStamp Value");
          // console.log(curTimeStampValue);
          // }

          timeStampValue = curTimeStampValue;
        }

        for (let i = timeStampValue; i < timeStampValue + 160 * 3; i += 3) {
          timeStampArray.push(i);
        }

        if (!initialFlag.current) {
          initialFlag.current = !initialFlag.current;
          Promise.all(promises).then(() => {
            trialDurations = startTimes.current.map(
              (time, idx) =>
                time * TICKS_PER_SECOND +
                durations[trialWords[idx]] * TICKS_PER_SECOND +
                endTimes[idx] * TICKS_PER_SECOND
            );

            // console.log("Resolved Promises");
            // console.log(durations);

            // Get all of the trial words based on the indices in the config

            // console.log("Trial Words");
            // console.log(trialWords);

            // loadWavFile(
            //   trialWords[currentWordIdxRef.current],
            //   startTimes.current[currentWordIdxRef.current],
            //   endTimes[currentWordIdxRef.current]
            // );

            console.log("currentWordIdxRef");
            console.log(currentWordIdxRef.current);

            loadWavFile(
              trialWords[currentWordIdxRef.current],
              startTimes.current[currentWordIdxRef.current],
              endTimes[currentWordIdxRef.current]
            )
              .then(() => {
                console.log("Wav file loaded successfully");
              })
              .catch((error) => {
                console.error("Failed to load wav file", error);
              });

            // Run the accumulation function. This will accumulate the values of the iterable object
            let accumulation = accumulate(trialDurations);

            accumulation.unshift(0);
            accumulation = accumulation.slice(0, -1);

            // Get all of the word starts by taking the accumulations (starting at 0), and adding the startTimes again
            const wordStarts = accumulation.map(
              (time, idx) => time + startTimes.current[idx] * TICKS_PER_SECOND
            );

            // Account for the delay at the very beginning of the trial that is parametrized by Trial Start
            const wordStartsShifted = wordStarts.map(
              (x) => x + timeStampValue + config.START_DELAY * TICKS_PER_SECOND
            );

            trialStartTimestamp.current =
              timeStampValue + config.START_DELAY * TICKS_PER_SECOND;

            startTimeStampValue =
              timeStampValue + config.START_DELAY * TICKS_PER_SECOND;

            // A shifted version of the accumulation array
            const accumulationShifted = accumulation.map(
              (x) => x + timeStampValue + config.START_DELAY * TICKS_PER_SECOND
            );

            // Calculate the final timestamp of the entire trial
            const finalTimestamp =
              accumulationShifted[accumulationShifted.length - 1] +
              trialDurations[trialDurations.length - 1];

            // Save the final timestamp to trialEndTimestamp.current
            trialEndTimestamp.current = finalTimestamp;

            console.log("Trial End Timestamp");
            console.log(trialEndTimestamp.current);

            const delay = (ms) => new Promise((res) => setTimeout(res, ms));

            (async function () {
              for (const [idx, word] of trialWords.entries()) {
                // console.log("Inside async function");
                // console.log(word);

                // Prepare the data to be sent
                const wordWithNull = `${word}`;
                const data = new Uint8Array(wordWithNull.length + 4); // 4 for timestamp
                data.set(new TextEncoder().encode(wordWithNull), 0); // converting word to bytes
                data.set(
                  new Uint8Array(
                    new Uint32Array([wordStartsShifted[idx]]).buffer
                  ),
                  wordWithNull.length
                ); // adding timestamp after word

                // Send the data to the signaling server
                signalingServer.current.send(data.buffer);

                // do something after 1000 milliseconds
                await delay(100);
              }
            })();
          });
        }

        if (trialDurations && initializeTrial.current) {
          let plotDataArray = [];
          for (let i = audioStart; i < audioEnd; i += 2) {
            plotDataArray.push(data.getInt16(i, true));
            // plotDataValue = data.getInt16(i, true);
          }

          let plotEnvelopeArray = [];
          for (let i = audioEnd; i < envelopeEnd; i += 2) {
            plotEnvelopeArray.push(data.getInt16(i, true));
            // plotEnvelopeValue = data.getInt16(i, true);
          }

          // console.log("Trial Durations");
          // console.log(trialDurations);
          // console.log(trialDurations[currentWordIdxRef.current]);

          console.log("Diff");
          console.log(timeStampValue - trialStartTimestamp.current);
          console.log("target");
          console.log(trialDurations[currentWordIdxRef.current]);

          if (
            timeStampValue - startTimeStampValue <
            trialDurations[currentWordIdxRef.current]
          ) {
            for (let i = 0; i < timeStampArray.length; i++) {
              if (i === 0) {
              }
              plotTimestamps.push(
                Math.floor(
                  (timeStampArray[i] - startTimeStampValue) /
                    (config.TICKS_PER_SECOND / sampleRate)
                )
              );
              plotData.push(plotDataArray[i]);
              envelopePlotData.push(plotEnvelopeArray[i]);
            }
          } else {
            currentWordIdxRef.current += 1;

            console.log("currentWordIdxRef");
            console.log(currentWordIdxRef.current);

            // console.log("Trial Words 2");
            // console.log(trialWords);

            // console.log("Current Word Idx Ref");
            // console.log(currentWordIdxRef.current);
            // console.log(trialWords);
            // console.log(startTimes.current);
            // console.log(endTimes);

            // loadWavFile(
            //   trialWords[currentWordIdxRef.current],
            //   startTimes.current[currentWordIdxRef.current],
            //   endTimes[currentWordIdxRef.current]
            // );

            if (
              trialEndTimestamp.current &&
              timeStampValueGlobal.current < trialEndTimestamp.current
            ) {
              loadWavFile(
                trialWords[currentWordIdxRef.current],
                startTimes.current[currentWordIdxRef.current],
                endTimes[currentWordIdxRef.current]
              )
                .then(() => {
                  console.log("Wav file loaded successfully");
                })
                .catch((error) => {
                  console.error("Failed to load wav file", error);
                });
            }

            startTimeStampValue = timeStampValue;
            plotTimestamps = [];
            plotData = [];
            envelopePlotData = [];

            for (let i = 0; i < numPoints; i++) {
              line.setY(i, 0);
              envelopeLine.setY(i, 0);
              wavLine.setY(i, 0);
              envelopeWavLine.setY(i, 0);
              // bufferIndex = (bufferIndex + 1) % numPoints;
            }

            for (let i = 0; i < timeStampArray.length; i++) {
              plotTimestamps.push(
                Math.floor(
                  (timeStampArray[i] - startTimeStampValue) /
                    (config.TICKS_PER_SECOND / sampleRate)
                )
              );
              plotData.push(plotDataArray[i]);
              envelopePlotData.push(plotEnvelopeArray[i]);
            }
          }
        }
      };
    };

    let lastTimestamp = null;
    // const sampleRate = 16000; // 16KHz

    // Render loop
    const animate = (timestamp) => {
      if (
        canvasRef.current &&
        envelopeCanvasRef.current &&
        initializeTrial.current
      ) {
        for (let i = 0; i < plotTimestamps.length; i++) {
          line.setY(plotTimestamps[i], plotData[i] / Math.pow(2, 15));
          envelopeLine.setY(
            plotTimestamps[i],
            envelopePlotData[i] / Math.pow(2, 15)
          );
          // bufferIndex = (bufferIndex + 1) % numPoints;
        }

        const markerPosition =
          (plotTimestamps[plotTimestamps.length - 1] +
            parseInt(sliderValueRef.current)) *
          (width / (windowWidth * sampleRate));

        // console.log(markerPosition);

        markerRef.current.style.left = `${markerPosition}px`;
        envelopeMarkerRef.current.style.left = `${markerPosition}px`;

        webglp.update();
        envelopeWebglp.update();

        lastTimestamp = timestamp;

        if (
          trialEndTimestamp.current &&
          timeStampValueGlobal.current >= trialEndTimestamp.current
        ) {
          if (peerConnection.current) {
            peerConnection.current.close();
          }
          if (signalingServer.current) {
            signalingServer.current.close();
          }
          // setIsStarted(false);

          // canvasRef.current = null;
          // envelopeCanvasRef.current = null;
          // markerRef.current = null;
          // envelopeMarkerRef.current = null;
          markerRef.current.style.left = `${0}px`;
          envelopeMarkerRef.current.style.left = `${0}px`;
          sliderValueRef.current = 0;
          peerConnection.current = null;
          dataChannel.current = null;
          signalingServer.current = null;
          wavDataRef.current = null;
          wavEnvelopeRef.current = null;
          currentWordIdxRef.current = 0;
          startTimes.current = [0];
          trialStartTimestamp.current = null;
          initializeTrial.current = false;
          trialEndTimestamp.current = null;
          timeStampValueGlobal.current = null;

          for (let i = 0; i < numPoints; i++) {
            line.setY(i, 0);
            envelopeLine.setY(i, 0);
            wavLine.setY(i, 0);
            envelopeWavLine.setY(i, 0);
            // bufferIndex = (bufferIndex + 1) % numPoints;
          }

          setPhonemes([{}]);
          setCurrentWord("");

          setIsStarted(false);

          initialFlag.current = false;
        }

        // if (peerConnection.current) {
        //   peerConnection.current.close();
        // }
        // if (signalingServer.current) {
        //   signalingServer.current.close();
        // }

        // console.log("Trial End Timestamp");
        // console.log(trialEndTimestamp.current);

        // console.log("Timestamp");
        // console.log(timestamp);
      }

      requestAnimationFrame(animate);
    };

    // Superimpose wav data if available
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
        peerConnection.current = null;
      }
      if (signalingServer.current) {
        signalingServer.current.close();
        signalingServer.current = null;
      }
    };
  }, [isStarted]);

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
      {isStarted &&
        phonemes.map((phoneme, index) => {
          const leftPosition =
            (((startTimes.current[currentWordIdxRef.current] + phoneme.xmin) *
              sampleRate) /
              numPoints) *
            width;
          var boxWidth =
            (((phoneme.xmax - phoneme.xmin) * sampleRate) / numPoints) * width;

          // console.log("boxWidth");
          // console.log(boxWidth);
          return (
            <div
              key={index}
              className="phoneme-box"
              style={{
                position: "absolute",
                left: `${leftPosition}px`,
                width: `${boxWidth}px`,
                height: "100%",
                background:
                  "linear-gradient(180deg, rgba(9,9,121,0.14049369747899154) 0%, rgba(0,212,255,0) 100%)",
                backgroundColor:
                  "linear-gradient(180deg, rgba(8,0,161,1) 0%, rgba(9,9,121,0.5522584033613445) 0%, rgba(0,212,255,0) 100%)",
                // border: "0.05px solid rgba(0, 0, 0, 0.06)",
                textAlign: "center",
                boxShadow: "0 0 0 0.05px rgba(0, 0, 0, 1)",
                // lineHeight: "400px",
                zIndex: "5",
                color: "rgba(8,0,161,0.5)",
                fontWeight: "bold",
                fontSize: "150%",
                paddingTop: "20px",
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
      <div
        style={{
          fontSize: "xxx-large",
          fontWeight: "bolder",
          color: "grey",
          textAlign: "center",
          zIndex: "100000000",
          position: "relative",
          opacity: "0.5",
        }}
      >
        {currentWord}
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        {!isStarted && (
          <button className="myButton" onClick={handleStartButtonClick}>
            Start
          </button>
        )}
      </div>
    </>
  );
};

export default MicrophonePlotRTC;
