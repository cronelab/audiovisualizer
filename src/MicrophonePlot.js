// MicrophonePlot.js
import React, { useRef, useEffect, useState } from "react";
import { WebglPlot, WebglStep, ColorRGBA } from "webgl-plot";
import "./MicrophonePlot.css";

const MicrophonePlot = () => {
  const canvasRef = useRef(null);
  const markerRef = useRef(null);
  const sliderValueRef = useRef(0);

  const bufferSize = 256;
  const width = window.innerWidth;
  const numPoints = 240000;

  useEffect(() => {
    const canvas = canvasRef.current;

    // Update the canvas size according to the device pixel ratio
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * devicePixelRatio;
    canvas.height = 400 * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = "400px";

    const webglp = new WebglPlot(canvas);

    const line = new WebglStep(new ColorRGBA(0.1, 0.1, 0.1, 1), numPoints);
    webglp.addLine(line);

    let bufferIndex = 0;

    // Set the spacing of the x-axis for the line
    line.lineSpaceX(-1, 2 / numPoints);

    // Access microphone input
    const getUserMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);

        // Set up ScriptProcessorNode
        const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
        source.connect(scriptNode);
        scriptNode.connect(audioContext.destination);

        // Process microphone data
        scriptNode.onaudioprocess = (event) => {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);

          //   console.log(inputData);

          // Update circular buffer with inputData
          for (let i = 0; i < inputData.length; i++) {
            line.setY(bufferIndex, inputData[i]);
            bufferIndex = (bufferIndex + 1) % numPoints;
          }

          // Update the marker position based on bufferIndex and sliderValue
          const markerPosition =
            ((bufferIndex + parseInt(sliderValueRef.current)) % numPoints) *
            (width / numPoints);
          markerRef.current.style.left = `${markerPosition}px`;
        };

        // Cleanup on unmount
        return () => {
          scriptNode.disconnect(audioContext.destination);
          scriptNode.onaudioprocess = null;
          source.disconnect(scriptNode);
          audioContext.close();
        };
      } catch (err) {
        console.error("Error accessing microphone:", err);
      }
    };

    const cleanup = getUserMedia();

    // Render loop
    const animate = () => {
      if (canvasRef.current) {
        webglp.update();
        requestAnimationFrame(animate);
      }
    };

    animate();

    return () => {
      cleanup && cleanup();
    };
  }, []);

  const handleSliderChange = (event) => {
    sliderValueRef.current = event.target.value;
  };

  return (
    <div className="plot-container">
      <div className="red-rectangle"></div>
      <canvas ref={canvasRef} />
      <div className="marker" ref={markerRef}></div>
      <input
        type="range"
        min="0"
        max={Math.round((numPoints - 1) / 10)}
        defaultValue="0"
        onChange={handleSliderChange}
        className="slider"
      />
    </div>
  );
};

export default MicrophonePlot;
