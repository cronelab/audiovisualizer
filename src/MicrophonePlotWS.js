// MicrophonePlot.js
import React, { useRef, useEffect, useState } from "react";
import { WebglPlot, WebglStep, ColorRGBA } from "webgl-plot";
import "./MicrophonePlot.css";

const MicrophonePlotWS = () => {
  const canvasRef = useRef(null);
  const markerRef = useRef(null);
  const sliderValueRef = useRef(0);

  const bufferSize = 256;
  const width = window.innerWidth;
  const numPoints = 32000;

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
    line.lineSpaceX(-1, 2 / numPoints);

    let plotData = [];
    const socket = new WebSocket("ws://10.17.145.76:6284");

    socket.binaryType = "arraybuffer";
    socket.onmessage = (event) => {
      console.log("message");

      const data = new DataView(event.data);
      const audioStart = 12;
      const audioEnd = audioStart + 320;
      for (let i = audioStart; i < audioEnd; i += 2) {
        plotData.push(data.getInt16(i, true));
      }

      //   console.log(plotData.length);
    };

    let lastTimestamp = null;
    const sampleRate = 80000; // 16KHz

    // Render loop
    const animate = (timestamp) => {
      if (canvasRef.current) {
        if (lastTimestamp) {
          // Calculate the elapsed time in seconds
          const elapsedTime = (timestamp - lastTimestamp) / 1000;

          // Calculate how many samples we should plot
          const samplesToPlot = Math.floor(elapsedTime * sampleRate);

          // Plot the data
          for (let i = 0; i < samplesToPlot && i < plotData.length; i++) {
            line.setY(bufferIndex, plotData[i] / 32768); // Normalize to [-1, 1]
            bufferIndex = (bufferIndex + 1) % numPoints;
          }

          // Remove plotted data from the buffer
          plotData = plotData.slice(samplesToPlot);

          // Update the marker position based on bufferIndex and sliderValue
          const markerPosition =
            ((bufferIndex + parseInt(sliderValueRef.current)) % numPoints) *
            (width / numPoints);
          markerRef.current.style.left = `${markerPosition}px`;

          // Update the WebGL plot
          webglp.update();
        }

        // Store the current timestamp
        lastTimestamp = timestamp;

        // Request the next animation frame
        requestAnimationFrame(animate);
      }
    };

    // Start the animation loop
    requestAnimationFrame(animate);

    // Cleanup on unmount
    return () => {
      socket.close();
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

export default MicrophonePlotWS;
